from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...db.helpers import get_participant
from ...db.models import DefinisiTugas, LogInteraksi
from ...db.session import get_db
from ...schemas.chat import ChatInput
from ...services.ai_provider import get_ai_response

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/chat")
async def chat_interaction(data: ChatInput, db: Session = Depends(get_db)):
    t_req_start = time.perf_counter()

    # ------------------------------------------------------------------
    # 1. Validasi partisipan & stage
    # ------------------------------------------------------------------
    p = get_participant(db, data.p_id)

    if not (2 <= p.id_tahap_sekarang <= 7):
        raise HTTPException(status_code=400, detail="Not in a chat stage")

    if p.jumlah_pesan_tahap_ini >= 3:
        raise HTTPException(status_code=400, detail="Stage already completed.")

    task = (
        db.query(DefinisiTugas)
        .filter(DefinisiTugas.id_tugas == p.id_tahap_sekarang - 1)
        .first()
    )
    if not task:
        raise HTTPException(status_code=500, detail="Task definition missing")

    word_count = len(data.message.split())
    if task.mode == "Restricted" and word_count > 30:
        raise HTTPException(status_code=400, detail="Message exceeds 30 words constraint.")

    # ------------------------------------------------------------------
    # 2. Baca riwayat percakapan (DB read)
    # ------------------------------------------------------------------
    t_db_read_start = time.perf_counter()
    existing_logs = (
        db.query(LogInteraksi)
        .filter(
            LogInteraksi.id_partisipan == p.id_partisipan,
            LogInteraksi.id_tugas == task.id_tugas,
        )
        .order_by(LogInteraksi.urutan_pesan.asc())
        .all()
    )
    history = [
        {"user": log.teks_input_user, "ai": log.jawaban_ai}
        for log in existing_logs
    ]
    t_db_read_ms = (time.perf_counter() - t_db_read_start) * 1000
    logger.info("[TIMING] DB read history       : %6.1f ms", t_db_read_ms)

    # ------------------------------------------------------------------
    # 3. Panggil AI provider — offload ke thread pool agar event loop
    #    tidak terblokir selama request HTTP ke LLM berlangsung.
    # ------------------------------------------------------------------
    t_ai_start = time.perf_counter()
    loop = asyncio.get_event_loop()
    ai_response_text: str = await loop.run_in_executor(
        None,
        lambda: get_ai_response(
            prompt=data.message,
            task_context=task.teks_instruksi,
            system_prompt=task.prompt_sistem,
            history=history,
            mode=task.mode,
        ),
    )
    t_ai_ms = (time.perf_counter() - t_ai_start) * 1000
    logger.info("[TIMING] AI provider call      : %6.1f ms", t_ai_ms)

    # Waktu respons AI untuk disimpan ke DB (dalam ms, integer)
    latency_ms = int(t_ai_ms)

    # ------------------------------------------------------------------
    # 4. Guard: AI error atau respons kosong — kembalikan tanpa simpan DB
    # ------------------------------------------------------------------
    if not ai_response_text or not ai_response_text.strip():
        logger.warning("[TIMING] AI returned empty response")
        return {
            "is_error": True,
            "ai_response": "Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali.",
            "msg_count": p.jumlah_pesan_tahap_ini,
            "stage_complete": False,
        }

    if ai_response_text.startswith("Error"):
        logger.warning("[TIMING] AI returned error: %s", ai_response_text[:80])
        return {
            "is_error": True,
            "ai_response": ai_response_text,
            "msg_count": p.jumlah_pesan_tahap_ini,
            "stage_complete": False,
        }

    # ------------------------------------------------------------------
    # 5. Simpan log ke database
    # ------------------------------------------------------------------
    t_db_write_start = time.perf_counter()
    try:
        log = LogInteraksi(
            id_partisipan=p.id_partisipan,
            id_tugas=task.id_tugas,
            teks_input_user=data.message,
            jumlah_kata=word_count,
            jawaban_ai=ai_response_text,
            waktu_respon_ms=latency_ms,
            waktu_berpikir_ms=data.waktu_berpikir_ms,
            urutan_pesan=p.jumlah_pesan_tahap_ini + 1,
        )
        db.add(log)
        p.jumlah_pesan_tahap_ini += 1
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Gagal menyimpan interaksi chat ke database: {str(e)}",
        )
    t_db_write_ms = (time.perf_counter() - t_db_write_start) * 1000
    logger.info("[TIMING] DB write log+commit   : %6.1f ms", t_db_write_ms)

    # ------------------------------------------------------------------
    # 6. Total request time
    # ------------------------------------------------------------------
    t_total_ms = (time.perf_counter() - t_req_start) * 1000
    logger.info(
        "[TIMING] TOTAL /chat request   : %6.1f ms  "
        "(read=%.1f | ai=%.1f | write=%.1f)",
        t_total_ms, t_db_read_ms, t_ai_ms, t_db_write_ms,
    )

    return {
        "is_error": False,
        "ai_response": ai_response_text,
        "msg_count": p.jumlah_pesan_tahap_ini,
        "stage_complete": p.jumlah_pesan_tahap_ini >= 3,
    }
