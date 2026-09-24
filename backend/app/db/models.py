from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func

from .session import Base


class Partisipan(Base):
    __tablename__ = "partisipan"

    id_partisipan = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    kebijakan_privasi = Column(Boolean, default=False)
    kelompok_usia = Column(String, nullable=True)
    jenis_kelamin = Column(String, nullable=True)
    latar_belakang = Column(String, nullable=True)
    detail_latar_belakang = Column(String, nullable=True)
    pernah_berinteraksi_ai = Column(String, nullable=True)
    id_tahap_sekarang = Column(Integer, default=0)
    jumlah_pesan_tahap_ini = Column(Integer, default=0)
    apakah_selesai = Column(Boolean, default=False)
    waktu_mulai = Column(DateTime(timezone=True), server_default=func.now())


class DefinisiTugas(Base):
    __tablename__ = "definisi_tugas"

    id_tugas = Column(Integer, primary_key=True, index=True)
    kode_tugas = Column(String, unique=True, index=True)
    mode = Column(String)
    teks_instruksi = Column(Text)
    prompt_sistem = Column(Text)


class LogInteraksi(Base):
    __tablename__ = "log_interaksi"

    id_log = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_partisipan = Column(String(36), ForeignKey("partisipan.id_partisipan"))
    id_tugas = Column(Integer, ForeignKey("definisi_tugas.id_tugas"))
    teks_input_user = Column(Text)
    jumlah_kata = Column(Integer)
    jawaban_ai = Column(Text)
    waktu_respon_ms = Column(Integer)
    waktu_berpikir_ms = Column(Integer, nullable=True)
    id_sesi = Column(String, nullable=True)
    urutan_pesan = Column(Integer)
    waktu_dibuat = Column(DateTime(timezone=True), server_default=func.now())
