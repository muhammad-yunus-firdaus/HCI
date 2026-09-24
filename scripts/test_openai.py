import os
import sys
from dotenv import load_dotenv

# Coba muat .env dari folder backend/ jika dijalankan dari root workspace
if os.path.exists("backend/.env"):
    load_dotenv(dotenv_path="backend/.env", override=True)
else:
    load_dotenv(override=True)

# Ambil API key dan model dari env
api_key = os.getenv("OPENAI_API_KEY")
configured_model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")

if not api_key:
    print("STATUS: Gagal - OPENAI_API_KEY tidak ditemukan di file .env.")
    sys.exit(1)

try:
    from openai import OpenAI
except ImportError:
    print("STATUS: Gagal - Library 'openai' tidak terinstall. Jalankan 'pip install openai'.")
    sys.exit(1)

# Daftar model yang dicoba secara bertahap
models_to_try = [configured_model]
for fallback in ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]:
    if fallback not in models_to_try:
        models_to_try.append(fallback)

prompt = "Ping! Respon dengan kata 'PONG' jika kamu aktif."
success = False

for model in models_to_try:
    try:
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            timeout=15.0
        )
        content = resp.choices[0].message.content.strip()
        print(f"STATUS: API Key OpenAI Aktif dan Berhasil! (Menggunakan model: {model})")
        print(f"Respon AI: \"{content}\"")
        success = True
        break
    except Exception as e:
        err_msg = str(e).lower()
        # Tangkap error quota
        if "insufficient_quota" in err_msg or "429" in err_msg or "quota" in err_msg:
            print("STATUS: Gagal - Insufficient Quota / Saldo Habis.")
            success = True
            break
        # Jika model salah atau error lain, lanjut coba model fallback berikutnya
        continue

if not success:
    print("STATUS: Gagal - Tidak dapat menghubungi OpenAI (Error: API Key tidak valid atau koneksi bermasalah).")
