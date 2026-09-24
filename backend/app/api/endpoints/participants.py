from __future__ import annotations

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...db.helpers import get_participant
from ...db.models import DefinisiTugas, Partisipan, LogInteraksi
from ...db.session import get_db
from ...schemas.participants import DemographicsInput, ParticipantOut, TaskInfoOut
from ...core.config import settings

router = APIRouter()


@router.post("/start", response_model=ParticipantOut)
def start_session(db: Session = Depends(get_db)):
    try:
        new_p = Partisipan()
        db.add(new_p)
        db.commit()
        db.refresh(new_p)
        return new_p
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal membuat sesi partisipan baru: {str(e)}")


@router.get("/status")
def get_status(p_id: UUID, db: Session = Depends(get_db)):
    p = get_participant(db, p_id)

    task_info = None
    chat_history = []
    
    if 2 <= p.id_tahap_sekarang <= 7:
        task = (
            db.query(DefinisiTugas)
            .filter(DefinisiTugas.id_tugas == p.id_tahap_sekarang - 1)
            .first()
        )
        if task:
            task_info = TaskInfoOut.model_validate(task).model_dump()
            
            # Fetch chat history for this participant in this specific task
            logs = (
                db.query(LogInteraksi)
                .filter(
                    LogInteraksi.id_partisipan == p.id_partisipan,
                    LogInteraksi.id_tugas == task.id_tugas
                )
                .all()
            )
            
            # Reconstruct history mapping
            for log in sorted(logs, key=lambda x: x.urutan_pesan):
                chat_history.append({"role": "user", "text": log.teks_input_user})
                chat_history.append({"role": "ai", "text": log.jawaban_ai})

    return {
        "current_stage": p.id_tahap_sekarang,
        "msg_count": p.jumlah_pesan_tahap_ini,
        "is_finished": p.apakah_selesai,
        "task_info": task_info,
        "chat_history": chat_history,
    }


@router.post("/demographics")
def save_demographics(
    p_id: UUID = Query(...),
    data: DemographicsInput | None = None,
    db: Session = Depends(get_db),
):
    if data is None:
        raise HTTPException(status_code=422, detail="Body is required")

    p = get_participant(db, p_id)
    if p.id_tahap_sekarang != 1:
        raise HTTPException(status_code=400, detail="Invalid stage for demographics")

    try:
        p.kelompok_usia = data.usia
        p.jenis_kelamin = data.gender
        p.latar_belakang = data.background
        p.detail_latar_belakang = data.detail_background
        p.pernah_berinteraksi_ai = data.pernah_berinteraksi_ai
        p.id_tahap_sekarang = 2
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan data demografi: {str(e)}")


@router.post("/consent")
def save_consent(p_id: UUID = Query(...), db: Session = Depends(get_db)):
    p = get_participant(db, p_id)
    try:
        p.kebijakan_privasi = True
        p.id_tahap_sekarang = 1
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan persetujuan: {str(e)}")


@router.post("/next-stage")
def move_next_stage(p_id: UUID = Query(...), db: Session = Depends(get_db)):
    p = get_participant(db, p_id)
    if p.jumlah_pesan_tahap_ini < 1:
        raise HTTPException(status_code=400, detail="Send at least one message first.")

    try:
        p.id_tahap_sekarang += 1
        p.jumlah_pesan_tahap_ini = 0

        if p.id_tahap_sekarang > 7:
            p.apakah_selesai = True

        db.commit()
        return {"current_stage": p.id_tahap_sekarang, "is_finished": p.apakah_selesai}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Gagal berpindah tahap: {str(e)}")


@router.get("/export")
def export_data(
    x_export_password: str | None = Header(None, alias="X-Export-Password"),
    password: str | None = Query(None),
    db: Session = Depends(get_db),
):
    provided_password = x_export_password or password
    if not settings.EXPORT_PASSWORD or provided_password != settings.EXPORT_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid export password")
        
    participants = db.query(Partisipan).order_by(Partisipan.waktu_mulai.asc()).all()
    
    def _clean(val) -> str:
        if val is None:
            return ""
        # Convert to string, split by lines, and join with a single space to avoid vertical expansion in Excel
        return " ".join(str(val).splitlines()).strip()
    
    output = io.StringIO()
    # Prepend BOM for Excel compatibility on Windows
    output.write('\ufeff')
    output.write('sep=;\r\n')
    
    writer = csv.writer(output, delimiter=';', quotechar='"', quoting=csv.QUOTE_MINIMAL, lineterminator='\r\n')
    
    # Write header
    writer.writerow([
        "ID Partisipan",
        "Waktu Mulai",
        "Kebijakan Privasi",
        "Kelompok Usia",
        "Jenis Kelamin",
        "Latar Belakang",
        "Detail Latar Belakang",
        "Pernah Berinteraksi AI",
        "Apakah Selesai",
        "Kode Tugas",
        "Mode Tugas",
        "ID Log",
        "Urutan Pesan",
        "Teks Input User",
        "Jumlah Kata",
        "Waktu Respon (ms)",
        "Jawaban AI",
        "Waktu Berpikir User (ms)",
        "Waktu Log Dibuat"
    ])
    
    for p in participants:
        logs = (
            db.query(LogInteraksi)
            .filter(LogInteraksi.id_partisipan == p.id_partisipan)
            .order_by(LogInteraksi.waktu_dibuat.asc(), LogInteraksi.urutan_pesan.asc())
            .all()
        )
        
        if not logs:
            writer.writerow([
                _clean(p.id_partisipan),
                p.waktu_mulai.isoformat() if p.waktu_mulai else "",
                p.kebijakan_privasi,
                _clean(p.kelompok_usia),
                _clean(p.jenis_kelamin),
                _clean(p.latar_belakang),
                _clean(p.detail_latar_belakang),
                _clean(p.pernah_berinteraksi_ai),
                p.apakah_selesai,
                "", "", "", "", "", "", "", "", "", ""
            ])
        else:
            for log in logs:
                task = db.query(DefinisiTugas).filter(DefinisiTugas.id_tugas == log.id_tugas).first()
                task_code = task.kode_tugas if task else ""
                task_mode = task.mode if task else ""
                
                writer.writerow([
                    _clean(p.id_partisipan),
                    p.waktu_mulai.isoformat() if p.waktu_mulai else "",
                    p.kebijakan_privasi,
                    _clean(p.kelompok_usia),
                    _clean(p.jenis_kelamin),
                    _clean(p.latar_belakang),
                    _clean(p.detail_latar_belakang),
                    _clean(p.pernah_berinteraksi_ai),
                    p.apakah_selesai,
                    _clean(task_code),
                    _clean(task_mode),
                    _clean(log.id_log),
                    log.urutan_pesan,
                    _clean(log.teks_input_user),
                    log.jumlah_kata,
                    log.waktu_respon_ms,
                    _clean(log.jawaban_ai),
                    log.waktu_berpikir_ms if log.waktu_berpikir_ms is not None else "",
                    log.waktu_dibuat.isoformat() if log.waktu_dibuat else ""
                ])
                
    csv_bytes = output.getvalue().encode('utf-8')
    headers = {
        'Content-Disposition': 'attachment; filename="data_riset_hci.csv"'
    }
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers=headers
    )
