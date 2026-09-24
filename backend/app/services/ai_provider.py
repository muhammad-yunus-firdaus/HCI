import logging
import os

import anthropic
from google import genai
from openai import OpenAI

from ..core.config import settings

logger = logging.getLogger(__name__)

_openai_client: OpenAI | None = None
_anthropic_client: anthropic.Anthropic | None = None
_gemini_client: genai.Client | None = None


def _get_openai_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=15.0,
            max_retries=0,
        )
    return _openai_client


def _get_anthropic_client() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(
            api_key=settings.CLAUDE_API_KEY,
            timeout=15.0,
            max_retries=0,
        )
    return _anthropic_client


def _get_gemini_client(api_key: str) -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def get_ai_response(
    prompt: str,
    task_context: str,
    system_prompt: str | None = None,
    history: list[dict] | None = None,
    mode: str = "Baseline",
) -> str:
    provider = settings.ACTIVE_MODEL.lower()
    logger.info("[AI] Provider active: %s | Mode: %s", provider, mode)

    base_prompt = system_prompt or (
        "Kamu adalah asisten AI untuk kebutuhan riset akademik interaksi manusia-AI. "
        "Berbicaralah seperti seorang rekan diskusi yang berpengetahuan luas — hangat, eksploratif, dan mengalir secara natural. "
        "Jawab secara komprehensif dan mendalam sesuai kebutuhan topik; jangan memotong penjelasan hanya karena ingin singkat."
    )

    # ----------------------------------------------------------------
    # Guardrail berbeda per mode:
    #   Baseline  — respons salam/basa-basi diizinkan, penolakan lunak
    #   Restricted — fokus ketat pada skenario, tolak off-topic tegas
    # ----------------------------------------------------------------
    if mode == "Restricted":
        guardrail_instruction = (
            "\n\nATURAN PENTING (MODE RESTRICTED):\n"
            "1. Kamu HANYA boleh merespons pertanyaan atau permintaan yang benar-benar relevan "
            "dengan topik skenario tugas di bawah. "
            "Jika pengguna mengajukan pertanyaan di luar topik skenario, tolak dengan sopan dan tegas: "
            "'Maaf, dalam sesi ini saya hanya dapat membantu pertanyaan yang berkaitan langsung dengan topik skenario tugas di layar.'\n"
            "2. Berikan jawaban yang akurat dan berdasarkan fakta objektif. "
            "Jika tidak yakin dengan suatu data spesifik, nyatakan secara jujur dan ulas secara umum — "
            "jangan mengarang informasi.\n"
            "3. Gunakan gaya bahasa yang jelas, padat, dan langsung pada inti. "
            "Boleh menggunakan poin-poin jika memudahkan pemahaman, tetapi tetap sertakan narasi penghubung.\n"
            "4. Jangan gunakan simbol Markdown heading (#, ##, ###, ####). "
            "Gunakan cetak tebal (**teks**) untuk penekanan atau judul bagian."
        )
    else:
        # Baseline — lebih santai, salam & basa-basi direspons secara natural
        guardrail_instruction = (
            "\n\nATURAN PENTING (MODE BASELINE):\n"
            "1. Kamu boleh merespons salam, sapaan, atau basa-basi (seperti 'halo', 'hai', 'selamat pagi') "
            "secara ramah dan natural — tidak perlu langsung menolak. "
            "Jika percakapan mulai menjauh dari topik skenario, secara halus arahkan kembali ke topik "
            "tanpa terasa kaku atau abrupt.\n"
            "2. Untuk pertanyaan yang jelas-jelas tidak berhubungan dengan skenario dan bukan sekadar basa-basi "
            "(misal: 'buatkan kode Python', 'siapa presiden Indonesia'), respons dengan santai namun tetap arahkan "
            "kembali ke konteks riset: 'Pertanyaan menarik! Tapi untuk sesi ini, yuk kita fokus ke topik tugas ya — "
            "ada yang ingin kamu eksplorasi dari skenario di layar?'\n"
            "3. Berikan jawaban yang akurat dan berdasarkan fakta objektif. "
            "Jika tidak yakin dengan suatu data spesifik, nyatakan secara jujur dan ulas secara umum — "
            "jangan mengarang informasi.\n"
            "4. Gunakan gaya bahasa percakapan yang natural dan mengalir. "
            "Jawablah secara eksploratif dan komprehensif — boleh panjang jika topik memerlukan penjelasan mendalam. "
            "Boleh menggunakan poin-poin, tetapi pastikan ada narasi penghubung yang membuat jawaban terasa utuh.\n"
            "5. Ketika memberikan saran, ide kreatif, atau pilihan solusi, sertakan brief singkat mengenai alasan, "
            "konsep, atau sudut pandang di balik tiap opsi — bukan sekadar daftar, tetapi penjelasan yang memberi "
            "nilai analitis dan membantu pengguna memahami mengapa opsi tersebut relevan atau menarik.\n"
            "6. Jangan gunakan simbol Markdown heading (#, ##, ###, ####). "
            "Gunakan cetak tebal (**teks**) untuk penekanan atau judul bagian."
        )

    system_instruction = (
        f"{base_prompt}{guardrail_instruction}\n\n"
        "User sedang dihadapkan pada tugas / skenario berikut di layarnya:\n"
        f"--- Mulai Skenario ---\n{task_context}\n--- Akhir Skenario ---"
    )

    # Sliding window context history: maks 4 item terakhir (2 turn percakapan)
    hist = history[-4:] if history else []

    # MOCK
    if provider == "mock":
        if hist:
            return f"Ini adalah respon simulasi lanjutan (turn {len(hist) + 1}) dari AI Provider."
        return "Ini adalah respon simulasi (mock) dari AI Provider."

    # GEMINI
    if provider == "gemini":
        api_key = (settings.GEMINI_API_KEY or "").strip()
        api_key_preview = api_key[:8] + "..." if api_key and len(api_key) > 8 else "(invalid/empty)"
        logger.info("[AI] Gemini API Key loaded: %s (length=%d)", api_key_preview, len(api_key))
        
        if not api_key or api_key == "YOUR_API_KEY":
            return "Error: Kunci API Gemini tidak ditemukan di .env."

        try:
            client = _get_gemini_client(api_key)

            contents = []
            for item in hist:
                if item.get("user"):
                    contents.append({"role": "user", "parts": [{"text": item["user"]}]})
                if item.get("ai"):
                    contents.append({"role": "model", "parts": [{"text": item["ai"]}]})
            contents.append({"role": "user", "parts": [{"text": prompt}]})

            response = client.models.generate_content(
                model=settings.GEMINI_MODEL_NAME,
                contents=contents,
                config={
                    "system_instruction": system_instruction,
                },
            )

            result_text = getattr(response, "text", None)
            if not result_text or not result_text.strip():
                return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."
            return result_text

        except Exception as e:
            error_msg = str(e).lower()
            logger.exception("[GEMINI ERROR] %s: %s", type(e).__name__, str(e))
            status_code = getattr(e, "status_code", None) or getattr(e, "code", None)

            if status_code == 429 or any(kw in error_msg for kw in ["quota", "exceeded", "billing", "insufficient_quota"]):
                print(f"[GEMINI QUOTA] status={status_code} | {str(e)}")
                return "Error: Kredit API Gemini habis atau belum diisi."

            if "rate" in error_msg or "too many" in error_msg:
                return "Error: Asisten AI sedang sibuk melayani banyak permintaan. Mohon tunggu sebentar lalu coba lagi."

            if status_code == 401 or any(kw in error_msg for kw in ["400", "api_key", "invalid", "unauthorized", "401"]):
                return "Error: Kunci API Gemini tidak valid. Periksa konfigurasi .env."

            if status_code == 403 or "403" in error_msg or "forbidden" in error_msg:
                return "Error: Akses API Gemini ditolak. Periksa izin kunci API Anda."

            return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."

    # ------------------------------------------------------------------
    # OPENAI
    # ------------------------------------------------------------------
    if provider == "openai":
        api_key_preview = (settings.OPENAI_API_KEY or "")[:8] + "..." if settings.OPENAI_API_KEY else "(None)"
        logger.info("[AI] OpenAI API Key loaded: %s (length=%d)", api_key_preview, len(settings.OPENAI_API_KEY or ""))
        
        if not settings.OPENAI_API_KEY:
            return "Error: Kunci API OpenAI tidak ditemukan di .env."

        try:
            client = _get_openai_client()
            messages = [{"role": "system", "content": system_instruction}]
            for item in hist:
                if item.get("user"):
                    messages.append({"role": "user", "content": item["user"]})
                if item.get("ai"):
                    messages.append({"role": "assistant", "content": item["ai"]})
            messages.append({"role": "user", "content": prompt})

            openai_model = os.getenv("OPENAI_MODEL_NAME", settings.OPENAI_MODEL_NAME)

            # Daftar model yang diketahui tidak valid / placeholder — fallback ke gpt-4o-mini
            _INVALID_MODEL_NAMES = {"gpt-5.6-luna", "gpt-5-luna", "YOUR_MODEL_NAME", ""}
            if openai_model in _INVALID_MODEL_NAMES:
                print(f"[OPENAI] Model '{openai_model}' tidak valid, fallback ke gpt-4o-mini")
                openai_model = "gpt-6-luna"


            call_kwargs: dict = {
                "model": openai_model,
                "messages": messages,
            }

            api_key_short = (settings.OPENAI_API_KEY or "")[:8]
            print(f"[OPENAI REQUEST] Model: {openai_model} | Key: {api_key_short}...")

            resp = client.chat.completions.create(**call_kwargs)

            result_text = resp.choices[0].message.content if resp.choices else None
            if not result_text or not result_text.strip():
                return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."
            return result_text

        except Exception as e:
            error_msg = str(e).lower()
            # Print traceback lengkap ke terminal Uvicorn agar bisa didiagnosis
            logger.exception("[OPENAI ERROR] %s: %s", type(e).__name__, str(e))

            # Cek status_code dari objek exception OpenAI SDK (lebih akurat dari string)
            status_code = getattr(e, "status_code", None)
            raw_str = str(e)

            # Quota/billing habis — 429 atau kode error insufficient_quota
            if status_code == 429 or any(kw in error_msg for kw in [
                "insufficient_quota", "quota", "billing", "exceeded",
                "hard_limit", "rate_limit_exceeded", "balance",
                "you exceeded your current quota",
            ]):
                print(f"[OPENAI QUOTA] status={status_code} | {raw_str}")
                return "Error: Kredit API OpenAI habis atau belum diisi."

            # Model tidak ditemukan — 404 atau pesan model_not_found
            if status_code == 404 or any(kw in error_msg for kw in ["model_not_found", "no such model", "does not exist"]):
                print(f"[OPENAI MODEL] Model tidak ditemukan: {raw_str}")
                return "Error: Model AI yang dikonfigurasi tidak tersedia. Periksa OPENAI_MODEL_NAME di .env."

            # BadRequestError (400) — parameter tidak sesuai, bukan masalah key/model
            if status_code == 400:
                print(f"[OPENAI BAD REQUEST] status=400 | {raw_str}")
                return "Error: Request parameter tidak sesuai (400)."

            # Rate limit biasa (terlalu cepat, bukan billing)
            if "rate_limit" in error_msg or "too many" in error_msg:
                return "Error: Asisten AI sedang sibuk melayani banyak permintaan. Mohon tunggu sebentar lalu coba lagi."

            # Invalid API key / Unauthorized — 401
            if status_code == 401 or any(kw in error_msg for kw in ["401", "invalid", "api_key", "unauthorized", "authentication"]):
                return "Error: Kunci API OpenAI tidak valid. Periksa konfigurasi .env."

            # Forbidden — 403
            if status_code == 403 or "403" in error_msg or "forbidden" in error_msg:
                return "Error: Akses API OpenAI ditolak. Periksa izin kunci API Anda."

            return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."

    # ------------------------------------------------------------------
    # CLAUDE
    # ------------------------------------------------------------------
    if provider == "claude":
        api_key_preview = (settings.CLAUDE_API_KEY or "")[:8] + "..." if settings.CLAUDE_API_KEY else "(None)"
        logger.info("[AI] Claude API Key loaded: %s (length=%d)", api_key_preview, len(settings.CLAUDE_API_KEY or ""))
        
        if not settings.CLAUDE_API_KEY:
            return "Error: Kunci API Claude tidak ditemukan di .env."

        try:
            client = _get_anthropic_client()
            messages = []
            for item in hist:
                if item.get("user"):
                    messages.append({"role": "user", "content": item["user"]})
                if item.get("ai"):
                    messages.append({"role": "assistant", "content": item["ai"]})
            messages.append({"role": "user", "content": prompt})

            resp = client.messages.create(
                model=os.getenv("ANTHROPIC_MODEL_NAME", settings.ANTHROPIC_MODEL_NAME),
                max_tokens=4096,  # required oleh SDK; nilai besar agar tidak memotong jawaban
                system=system_instruction,
                messages=messages,
            )

            result_text = resp.content[0].text if resp.content else None
            if not result_text or not result_text.strip():
                return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."
            return result_text

        except Exception as e:
            error_msg = str(e).lower()
            logger.exception("[CLAUDE ERROR] %s: %s", type(e).__name__, str(e))
            status_code = getattr(e, "status_code", None)

            if status_code == 429 or any(kw in error_msg for kw in ["quota", "exceeded", "billing", "insufficient", "credit"]):
                print(f"[CLAUDE QUOTA] status={status_code} | {str(e)}")
                return "Error: Kredit API Claude habis atau belum diisi."

            if "rate" in error_msg or "too many" in error_msg:
                return "Error: Asisten AI sedang sibuk melayani banyak permintaan. Mohon tunggu sebentar lalu coba lagi."

            if status_code == 401 or any(kw in error_msg for kw in ["401", "invalid", "api_key", "unauthorized", "authentication"]):
                return "Error: Kunci API Claude tidak valid. Periksa konfigurasi .env."

            return "Error: Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali."

    return f"Sistem: Provider '{provider}' tidak valid."
