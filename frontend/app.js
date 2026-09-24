function getApiUrl() {
    if (window.location.hostname.includes("devtunnels.ms") || window.location.hostname.includes("github.dev")) {
        if (window.location.hostname.includes("-5500.")) {
            const backendHost = window.location.hostname.replace("-5500.", "-8000.");
            return `${window.location.protocol}//${backendHost}/api`;
        }
        return window.location.origin + "/api";
    }

    if (window.location.port === "5500" || window.location.port === "3000" || window.location.port === "5173") {
        return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    }

    return window.location.origin + "/api";
}

const API_URL = getApiUrl();
console.log("[Riset HCI] API Base URL set to:", API_URL);

let state = {
    p_id: localStorage.getItem('participant_id'),
    currentStage: 0,
    msgCount: 0,
    isFinished: false,
    taskInfo: null,
    chatHistory: [],
    isDark: true,
    lastActionTime: null,
    showFeedbackButtons: false
};

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatInlineMarkdown(text) {
    if (!text) return "";
    let formatted = text;
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em class="italic text-gray-800 dark:text-gray-300">$1</em>');
    return formatted;
}

function renderTableHtml(rows) {
    if (rows.length === 0) return "";
    let tableHtml = '<div class="overflow-x-auto my-4 rounded-xl border border-gray-200 dark:border-gray-800"><table class="min-w-full border-collapse text-xs text-left">';
    let hasHeader = false;

    rows.forEach(line => {
        const cols = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);

        if (cols.every(col => col.match(/^[\-\s\:]+$/))) {
            return;
        }

        if (!hasHeader) {
            tableHtml += '<thead class="bg-gray-100 dark:bg-[#1a1a1a] text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-800"><tr>';
            cols.forEach(col => {
                tableHtml += `<th class="px-4 py-2.5 font-bold">${formatInlineMarkdown(col)}</th>`;
            });
            tableHtml += '</tr></thead><tbody class="divide-y divide-gray-100 dark:divide-gray-800/50">';
            hasHeader = true;
        } else {
            tableHtml += '<tr class="hover:bg-gray-50/50 dark:hover:bg-[#151515]/30">';
            cols.forEach(col => {
                tableHtml += `<td class="px-4 py-2 text-gray-700 dark:text-gray-300">${formatInlineMarkdown(col)}</td>`;
            });
            tableHtml += '</tr>';
        }
    });

    tableHtml += '</tbody></table></div>';
    return tableHtml;
}

function parseMarkdown(text) {
    if (!text) return "";

    let escapedText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    let lines = escapedText.split('\n');
    let resultHtml = [];
    let inList = false;
    let inTable = false;
    let tableRows = [];
    let paragraphLines = [];

    function flushParagraph() {
        if (paragraphLines.length > 0) {
            let content = paragraphLines.join('<br>');
            resultHtml.push(`<p class="leading-relaxed mb-2.5">${formatInlineMarkdown(content)}</p>`);
            paragraphLines = [];
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();

        if (trimmed.startsWith('|')) {
            flushParagraph();
            if (inList) {
                resultHtml.push('</ul>');
                inList = false;
            }
            inTable = true;
            tableRows.push(trimmed);
            continue;
        } else if (inTable) {
            resultHtml.push(renderTableHtml(tableRows));
            tableRows = [];
            inTable = false;
        }

        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            flushParagraph();
            if (!inList) {
                resultHtml.push('<ul class="space-y-1.5 my-3">');
                inList = true;
            }
            let content = trimmed.substring(2).trim();
            resultHtml.push(`<li class="ml-4 list-disc pl-1 py-0.5">${formatInlineMarkdown(content)}</li>`);
            continue;
        } else if (inList && trimmed === "") {
            let nextLineIsList = false;
            for (let j = i + 1; j < lines.length; j++) {
                let nextLineTrimmed = lines[j].trim();
                if (nextLineTrimmed === "") continue;
                if (nextLineTrimmed.startsWith('* ') || nextLineTrimmed.startsWith('- ')) {
                    nextLineIsList = true;
                }
                break;
            }
            if (nextLineIsList) {
                continue;
            } else {
                resultHtml.push('</ul>');
                inList = false;
            }
        } else if (inList) {
            resultHtml.push('</ul>');
            inList = false;
        }

        if (trimmed === "") {
            flushParagraph();
            continue;
        }

        if (trimmed === '---') {
            flushParagraph();
            resultHtml.push('<hr class="my-4 border-gray-200 dark:border-gray-800" />');
            continue;
        }

        if (trimmed.startsWith('### ')) {
            flushParagraph();
            resultHtml.push(`<h3 class="text-[15px] font-bold text-gray-900 dark:text-white mt-4 mb-1.5">${formatInlineMarkdown(trimmed.substring(4))}</h3>`);
            continue;
        } else if (trimmed.startsWith('## ')) {
            flushParagraph();
            resultHtml.push(`<h2 class="text-base font-bold text-gray-900 dark:text-white mt-5 mb-2">${formatInlineMarkdown(trimmed.substring(3))}</h2>`);
            continue;
        } else if (trimmed.startsWith('# ')) {
            flushParagraph();
            resultHtml.push(`<h1 class="text-lg font-bold text-gray-900 dark:text-white mt-6 mb-2.5">${formatInlineMarkdown(trimmed.substring(2))}</h1>`);
            continue;
        }

        paragraphLines.push(trimmed);
    }

    flushParagraph();
    if (inList) {
        resultHtml.push('</ul>');
    }
    if (inTable) {
        resultHtml.push(renderTableHtml(tableRows));
    }

    return resultHtml.join('\n').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}

const container = document.getElementById('app-container');

async function init() {
    updateMacroProgress();
    updateSidebarToggleIcon();

    const savedId = localStorage.getItem('participant_id');
    let readyState = "NO_SESSION";

    if (savedId && savedId !== "undefined" && savedId !== "null") {
        state.p_id = savedId;
        readyState = await syncState();
        if (readyState !== "SUCCESS") {
            console.log("Session invalid or backend unreachable. Status: " + readyState);
        }
    }

    if (readyState === "NOT_FOUND" || readyState === "NO_SESSION") {
        const created = await createNewSession();
        if (created) {
            readyState = "SUCCESS";
        } else {
            readyState = "NETWORK_ERROR";
        }
    }

    if (readyState === "NETWORK_ERROR" || readyState === "SERVER_ERROR") {
        renderBackendDisconnected();
        return;
    }

    render();
}

async function createNewSession() {
    try {
        const resp = await fetch(`${API_URL}/start`, { method: 'POST' });
        if (!resp.ok) return false;

        const data = await resp.json();
        if (!data.id_partisipan) return false;

        state.p_id = data.id_partisipan;
        localStorage.setItem('participant_id', state.p_id);
        const syncResult = await syncState();
        return syncResult === "SUCCESS";
    } catch (e) {
        return false;
    }
}

function renderBackendDisconnected() {
    container.innerHTML = `
        <div class="glass p-10 w-full max-w-2xl mt-10 text-center">
            <h2 class="text-2xl font-bold mb-3">Backend belum tersambung</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                UI berhasil terbuka, tetapi API di <span class="font-mono">${API_URL}</span> tidak bisa diakses.
                Jalankan backend (FastAPI) di port <span class="font-mono">8000</span>, lalu klik tombol di bawah.
            </p>
            <button type="button" onclick="init()" class="btn-monochrome w-full py-4 bg-black text-white dark:bg-white dark:text-black font-bold rounded-2xl uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">
                Coba Sambungkan Lagi
            </button>
            <p class="text-[11px] mt-6 text-gray-400">
                Jika backend sudah jalan tapi masih gagal, cek firewall atau port 8000 sedang dipakai.
            </p>
        </div>
    `;
    lucide.createIcons();
}

async function syncState() {
    try {
        const resp = await fetch(`${API_URL}/status?p_id=${state.p_id}`);
        if (!resp.ok) {
            if (resp.status === 404) return "NOT_FOUND";
            return "SERVER_ERROR";
        }

        const data = await resp.json();
        state.currentStage = data.current_stage;
        state.msgCount = data.msg_count;
        state.isFinished = data.is_finished;
        state.taskInfo = data.task_info;
        state.chatHistory = data.chat_history || [];
        updateMacroProgress();
        return "SUCCESS";
    } catch (e) {
        return "NETWORK_ERROR";
    }
}

function updateMacroProgress() {
    const progressLine = document.getElementById('progress-line');
    const stageTitle = document.getElementById('stage-title');
    const iconContainer = document.getElementById('stage-icon-container');

    const percentage = ((state.currentStage + 1) / 8) * 100;
    progressLine.style.width = `${percentage}%`;
    progressLine.className = `fixed top-0 left-0 h-1 z-[60] transition-all duration-500 ${state.isDark ? 'bg-white' : 'bg-black'}`;

    const stages = [
        { label: "Stage 0", title: "Persetujuan Riset", icon: "graduation-cap" },
        { label: "Stage 1", title: "Profil Partisipan", icon: "user" },
        { label: "Task A", title: "Task A (Baseline)", icon: "message-square" },
        { label: "Task A", title: "Task A (Restricted)", icon: "lock" },
        { label: "Task B", title: "Task B (Baseline)", icon: "message-square" },
        { label: "Task B", title: "Task B (Restricted)", icon: "lock" },
        { label: "Task C", title: "Task C (Baseline)", icon: "message-square" },
        { label: "Task C", title: "Task C (Restricted)", icon: "lock" }
    ];

    if (stages[state.currentStage]) {
        stageTitle.innerText = stages[state.currentStage].title;
        iconContainer.innerHTML = `<i data-lucide="${stages[state.currentStage].icon}" class="w-4 h-4 text-gray-600 dark:text-gray-400"></i>`;
    }

    const sidebarContainer = document.getElementById('sidebar-steps-container');
    if (sidebarContainer) {
        let sidebarHTML = '';
        stages.forEach((stage, idx) => {
            const isActive = idx === state.currentStage;
            const isPast = idx < state.currentStage;

            let statusIcon = '';
            let lineClass = '';

            if (isPast) {
                statusIcon = `<div class="w-6 h-6 rounded-full bg-gray-900 dark:bg-[#e3e3e3] flex items-center justify-center text-white dark:text-gray-900 z-10"><i data-lucide="check" class="w-3.5 h-3.5"></i></div>`;
                lineClass = 'bg-gray-300 dark:bg-[#555]';
            } else if (isActive) {
                statusIcon = `<div class="w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white z-10 scale-110 shadow-lg shadow-blue-500/20"><i data-lucide="${stage.icon}" class="w-3.5 h-3.5"></i></div>`;
                lineClass = 'bg-gray-200 dark:bg-[#222]';
            } else {
                statusIcon = `<div class="w-6 h-6 rounded-full border-[1.5px] border-gray-300 dark:border-[#444] bg-transparent flex items-center justify-center text-gray-400 dark:text-[#666] z-10"><i data-lucide="${stage.icon}" class="w-3.5 h-3.5"></i></div>`;
                lineClass = 'bg-gray-200 dark:bg-[#222]';
            }

            const isLast = idx === stages.length - 1;

            sidebarHTML += `
                <div class="relative flex items-center gap-4 group p-2.5 rounded-xl transition-all cursor-default sidebar-item-container ${isActive ? 'bg-gray-200 dark:bg-[#1a1a1a]' : ''}">
                    ${!isLast ? `<div class="absolute left-[20px] top-[34px] bottom-[-10px] w-[1px] ${lineClass} sidebar-text-content"></div>` : ''}
                    <div class="relative shrink-0 flex items-center justify-center p-1">${statusIcon}</div>
                    <div class="flex-1 flex flex-col justify-center sidebar-text-content overflow-hidden">
                        <p class="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1 leading-none uppercase">${stage.label}</p>
                        <h3 class="text-[13px] ${isActive ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-500 dark:text-[#a1a1aa] font-medium'} leading-tight tracking-wide truncate transition-all">${stage.title}</h3>
                    </div>
                </div>
            `;
        });
        sidebarContainer.innerHTML = sidebarHTML;
    }
    lucide.createIcons();
}

// Reset scroll ke atas untuk kontainer utama (#app-container) dan window.
// Dipanggil setiap kali terjadi perpindahan stage/halaman.
function scrollToTop() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
    if (state.isFinished) return renderFinal();
    switch (state.currentStage) {
        case 0: return renderConsent();
        case 1: return renderDemographics();
        default: return renderChat();
    }
}

function renderConsent() {
    container.innerHTML = `
        <div class="glass p-10 w-full max-w-2xl animate-in fade-in zoom-in-95 duration-700 mt-10">
            <h2 class="text-2xl font-bold mb-6">Kebijakan Privasi & Persetujuan Riset</h2>
            <p class="text-sm text-gray-500 mb-8">Mohon simak dan pahami informasi berikut sebelum Anda melanjutkan ke eksperimen.</p>
            
            <div class="space-y-6 mb-10 text-sm">
                <div class="flex space-x-4">
                    <div class="mt-1"><i data-lucide="lock" class="w-5 h-5 text-gray-400"></i></div>
                    <div>
                        <h3 class="font-bold mb-1 border-b border-gray-100 dark:border-gray-800 pb-1">1. Kebijakan Data & Privasi</h3>
                        <p class="text-gray-500 dark:text-gray-400 leading-relaxed">Meskipun kami mengumpulkan data profil/latar belakang Anda secara umum di awal, tidak ada data identitas langsung (seperti nama, email, atau alamat) yang akan direkam. Seluruh data dan interaksi percakapan Anda akan disamarkan secara anonim murni untuk keperluan penelitian.</p>
                    </div>
                </div>
                <div class="flex space-x-4">
                    <div class="mt-1"><i data-lucide="workflow" class="w-5 h-5 text-gray-400"></i></div>
                    <div>
                        <h3 class="font-bold mb-1 border-b border-gray-100 dark:border-gray-800 pb-1">2. Alur Penelitian</h3>
                        <p class="text-gray-500 dark:text-gray-400 leading-relaxed">Setelah mengisi kuesioner profil demografi, Anda akan menjalankan 3 buah skenario yang berbeda (Task A, Task B, Task C) yang melibatkan interaksi percakapan dengan AI.</p>
                    </div>
                </div>
                <div class="flex space-x-4">
                    <div class="mt-1"><i data-lucide="settings-2" class="w-5 h-5 text-gray-400"></i></div>
                    <div>
                        <h3 class="font-bold mb-1 border-b border-gray-100 dark:border-gray-800 pb-1">3. Mode Interaksi (2 Tahapan)</h3>
                        <p class="text-gray-500 dark:text-gray-400 leading-relaxed mb-2">Masing-masing dari ketiga skenario tugas tersebut memiliki dua tipe tahapan/mode:</p>
                        <ul class="list-disc list-inside text-gray-500 dark:text-gray-400 space-y-1.5 ml-2">
                            <li><strong class="text-gray-700 dark:text-gray-300">Baseline Mode:</strong> Anda dibebaskan untuk berinteraksi dengan AI sepenuhnya tanpa ada batasan terkait jumlah teks/kata.</li>
                            <li><strong class="text-gray-700 dark:text-gray-300">Restricted Mode:</strong> Anda diminta untuk berinteraksi dengan AI menggunakan batasan maksimal 30 kata per pesan.</li>
                        </ul>
                    </div>
                </div>
                <div class="flex space-x-4">
                    <div class="mt-1"><i data-lucide="alert-circle" class="w-5 h-5 text-gray-400"></i></div>
                    <div>
                        <h3 class="font-bold mb-1 border-b border-gray-100 dark:border-gray-800 pb-1">4. Aturan Penting Penugasan</h3>
                        <p class="text-gray-500 dark:text-gray-400 leading-relaxed">Mohon selesaikan dan berinteraksilah senatural &amp; sejujur mungkin. Perlu diketahui bahwa Anda tidak dapat mengulang atau melewati (skip) task yang sedang atau telah dikerjakan.</p>
                    </div>
                </div>
            </div>

            <label class="flex items-start space-x-4 p-5 md:p-6 border border-gray-200 dark:border-white/10 rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-all mb-8">
                <input type="checkbox" id="consent-check" onchange="toggleConsentBtn(this)" class="mt-1 shrink-0 w-5 h-5 rounded border-gray-300 text-black focus:ring-black">
                <span class="text-sm font-medium leading-relaxed">Saya menyatakan telah memahami semua poin di atas dan secara sadar menyetujui keberlangsungan eksperimen ini.</span>
            </label>

            <button id="consent-btn" type="button" disabled onclick="handleConsent()" class="btn-monochrome w-full py-5 bg-black text-white dark:bg-white dark:text-black font-bold rounded-2xl uppercase tracking-widest flex items-center justify-center space-x-2 disabled:opacity-30 disabled:cursor-not-allowed">
                <span>Mulai</span>
                <i data-lucide="arrow-right" class="w-5 h-5"></i>
            </button>
        </div>
    `;
    lucide.createIcons();
}

function toggleConsentBtn(el) {
    const btn = document.getElementById('consent-btn');
    btn.disabled = !el.checked;
}

function renderDemographics() {
    container.innerHTML = `
        <div class="glass p-10 w-full max-w-2xl animate-in fade-in zoom-in-95 duration-700 mt-10">
            <h2 class="text-2xl font-bold mb-2">Latar Belakang</h2>
            <p class="text-sm text-gray-500 mb-10">Informasi ini bersifat anonim dan hanya digunakan untuk keperluan penelitian mengenai pola interaksi manusia dengan AI.</p>
            
            <form onsubmit="handleDemographics(event)" class="space-y-8">
                <div>
                    <label class="flex items-center space-x-2 text-xs font-bold uppercase text-gray-500 mb-3">
                        <i data-lucide="graduation-cap" class="w-4 h-4"></i>
                        <span>Latar Belakang</span>
                    </label>
                    <div class="relative">
                        <select name="background" onchange="toggleBgDetail(this.value)" required class="input-monochrome w-full p-4 pr-12 rounded-xl focus:ring-2 focus:ring-gray-400 focus:outline-none cursor-pointer transition-all appearance-none">
                            <option value="" disabled selected>Pilih latar belakang Anda...</option>
                            <option value="Pelajar">Pelajar SMA/SMK</option>
                            <option value="Mahasiswa S1">Mahasiswa S1</option>
                            <option value="Mahasiswa Pascasarjana">Mahasiswa S2/S3</option>
                            <option value="Profesional">Profesional / Pekerja</option>
                            <option value="Lainnya">Lainnya</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                            <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400"></i>
                        </div>
                    </div>
                </div>

                <div id="detail-bg-container" class="hidden animate-in fade-in slide-in-from-top-2">
                    <label class="flex items-center space-x-2 text-xs font-bold uppercase text-gray-500 mb-3">
                        <i data-lucide="book-open" class="w-4 h-4"></i>
                        <span id="detail-label">Program Studi / Jurusan</span>
                    </label>
                    <input type="text" name="detail_background" id="detail-input" class="input-monochrome w-full p-4 rounded-xl focus:ring-2 focus:ring-gray-400 focus:outline-none transition-all" placeholder="Tuliskan di sini...">
                </div>

                <div>
                    <label class="flex items-center space-x-2 text-xs font-bold uppercase text-gray-500 mb-3">
                        <i data-lucide="users" class="w-4 h-4"></i>
                        <span>Kelompok Usia</span>
                    </label>
                    <div class="relative">
                        <select name="usia" required class="input-monochrome w-full p-4 pr-12 rounded-xl focus:ring-2 focus:ring-gray-400 focus:outline-none cursor-pointer transition-all appearance-none">
                            <option value="" disabled selected>Pilih rentang usia Anda...</option>
                            <option value="18-24">18-24 tahun</option>
                            <option value="25-34">25-34 tahun</option>
                            <option value="35+">35+ tahun</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                            <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400"></i>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="flex items-center space-x-2 text-xs font-bold uppercase text-gray-500 mb-3">
                        <i data-lucide="user" class="w-4 h-4"></i>
                        <span>Jenis Kelamin</span>
                    </label>
                    <div class="relative">
                        <select name="gender" required class="input-monochrome w-full p-4 pr-12 rounded-xl focus:ring-2 focus:ring-gray-400 focus:outline-none cursor-pointer transition-all appearance-none">
                            <option value="" disabled selected>Pilih jenis kelamin Anda...</option>
                            <option value="Laki-laki">Laki-laki</option>
                            <option value="Perempuan">Perempuan</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                            <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400"></i>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="flex items-center space-x-2 text-xs font-bold uppercase text-gray-500 mb-3">
                        <i data-lucide="message-square" class="w-4 h-4"></i>
                        <span>Apakah pernah berinteraksi dengan AI sebelum nya?</span>
                    </label>
                    <div class="relative">
                        <select name="pernah_berinteraksi_ai" required class="input-monochrome w-full p-4 pr-12 rounded-xl focus:ring-2 focus:ring-gray-400 focus:outline-none cursor-pointer transition-all appearance-none">
                            <option value="" disabled selected>Pilih jawaban Anda...</option>
                            <option value="Ya, sering">Ya, sering</option>
                            <option value="Ya, kadang-kadang">Ya, kadang-kadang</option>
                            <option value="Belum pernah">Belum pernah</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                            <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400"></i>
                        </div>
                    </div>
                </div>

                <button type="submit" class="btn-monochrome w-full py-5 bg-black text-white dark:bg-white dark:text-black font-bold rounded-2xl uppercase tracking-widest flex items-center justify-center space-x-2 mt-10">
                    <span>Mulai</span>
                    <i data-lucide="arrow-right" class="w-5 h-5"></i>
                </button>
            </form>
        </div>
    `;
    lucide.createIcons();
}

function toggleBgDetail(val) {
    const container = document.getElementById('detail-bg-container');
    const label = document.getElementById('detail-label');
    const input = document.getElementById('detail-input');

    if (val) {
        container.classList.remove('hidden');
        if (val.includes('Mahasiswa') || val === 'Pelajar') {
            label.innerText = 'Program Studi / Jurusan';
            input.placeholder = 'Contoh: Teknik Informatika';
        } else {
            label.innerText = 'Profesi / Bidang Pekerjaan';
            input.placeholder = 'Contoh: Software Engineer';
        }
    }
}

async function handleConsent() {
    try {
        if (!state.p_id) {
            throw new Error('Backend belum tersambung. Jalankan server backend di port 8000 lalu klik "Coba Sambungkan Lagi".');
        }
        const resp = await fetch(`${API_URL}/consent?p_id=${state.p_id}`, { method: 'POST' });

        if (resp.status === 404) {
            alert("Sesi tidak valid atau telah usang. Halaman akan dimuat ulang untuk memulai sesi baru.");
            localStorage.removeItem('participant_id');
            location.reload();
            return;
        }

        if (!resp.ok) {
            const errData = await resp.json();
            throw new Error(errData.detail || "Gagal menyimpan persetujuan");
        }
        await syncState();
        scrollToTop();
        render();
    } catch (e) {
        alert("Error: " + e.message);
    }
}

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar-progress');
    const backdrop = document.getElementById('sidebar-backdrop');
    const appContainer = document.getElementById('app-container');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    if (isDesktop) {
        sidebar.classList.remove('sidebar-open');
        if (backdrop) backdrop.classList.remove('backdrop-open');
        if (appContainer) appContainer.classList.remove('scroll-locked');
        sidebar.classList.toggle('sidebar-collapsed');
        return;
    }

    sidebar.classList.remove('sidebar-collapsed');
    const willOpen = !sidebar.classList.contains('sidebar-open');
    sidebar.classList.toggle('sidebar-open', willOpen);
    if (backdrop) backdrop.classList.toggle('backdrop-open', willOpen);
    if (appContainer) appContainer.classList.toggle('scroll-locked', willOpen);

    updateSidebarToggleIcon();
};

(function setupSidebarDrawer() {
    const backdrop = document.getElementById('sidebar-backdrop');
    const sidebar = document.getElementById('sidebar-progress');
    const appContainer = document.getElementById('app-container');
    if (!backdrop || !sidebar) return;

    const closeDrawer = () => {
        sidebar.classList.remove('sidebar-open');
        backdrop.classList.remove('backdrop-open');
        if (appContainer) appContainer.classList.remove('scroll-locked');
    };

    backdrop.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDrawer();
    });

    window.addEventListener('resize', () => {
        const isDesktop = window.matchMedia('(min-width: 768px)').matches;
        if (isDesktop) {
            sidebar.classList.remove('sidebar-open');
            backdrop.classList.remove('backdrop-open');
            if (appContainer) appContainer.classList.remove('scroll-locked');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
        }

        updateSidebarToggleIcon();
    });
})();

function updateSidebarToggleIcon() {
    const host = document.getElementById('sidebar-toggle-icon');
    if (!host) return;

    const sidebar = document.getElementById('sidebar-progress');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    if (!isDesktop) {
        host.innerHTML = '<i data-lucide="menu" class="w-5 h-5"></i>';
        lucide.createIcons();
        return;
    }

    const isCollapsed = !!sidebar && sidebar.classList.contains('sidebar-collapsed');
    host.innerHTML = `<i data-lucide="${isCollapsed ? 'menu' : 'panel-left'}" class="w-5 h-5"></i>`;
    lucide.createIcons();
}

async function handleDemographics(e) {
    e.preventDefault();
    if (!state.p_id) {
        alert('Backend belum tersambung. Jalankan server backend di port 8000 lalu klik "Coba Sambungkan Lagi".');
        return;
    }
    const formData = new FormData(e.target);
    const data = {
        p_id: state.p_id,
        usia: formData.get('usia'),
        gender: formData.get('gender') || 'Lainnya',
        background: formData.get('background'),
        detail_background: formData.get('detail_background'),
        pernah_berinteraksi_ai: formData.get('pernah_berinteraksi_ai')
    };

    try {
        let resp = await fetch(`${API_URL}/demographics?p_id=${state.p_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            
            // Self-healing: jika stage di backend belum 1 (misal consent belum terekam), otomatis simpan consent lalu coba simpan demografi lagi
            if (resp.status === 400 && (errData.detail === "Invalid stage for demographics" || errData.detail?.includes("Invalid stage"))) {
                await fetch(`${API_URL}/consent?p_id=${state.p_id}`, { method: 'POST' });
                resp = await fetch(`${API_URL}/demographics?p_id=${state.p_id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }
        }

        if (!resp.ok) {
            const finalErr = await resp.json().catch(() => ({}));
            throw new Error(finalErr.detail || "Gagal menyimpan profil");
        }

        await syncState();
        scrollToTop();
        render();
    } catch (e) {
        alert("Error: " + e.message);
    }
}

function updateChatControls() {
    const feedbackArea = document.getElementById('feedback-options-area');
    const proceedArea = document.getElementById('optional-proceed-area');
    const inputContainer = document.getElementById('chat-input-container');
    const bottomHint = document.getElementById('chat-bottom-hint');
    const wordCounter = document.getElementById('word-counter-ui');
    const chatInput = document.getElementById('chat-input');

    if (!feedbackArea || !proceedArea || !inputContainer) return;

    if (state.msgCount >= 3) {
        feedbackArea.classList.add('hidden');
        inputContainer.classList.add('hidden');
        if (bottomHint) bottomHint.classList.add('hidden');
        if (wordCounter) wordCounter.classList.add('hidden');
        if (chatInput) chatInput.disabled = true;

        proceedArea.classList.remove('hidden');
    } else if (state.showFeedbackButtons) {
        feedbackArea.classList.remove('hidden');
        proceedArea.classList.add('hidden');
        inputContainer.classList.add('opacity-40', 'pointer-events-none');
        inputContainer.classList.remove('hidden');
        if (bottomHint) bottomHint.classList.add('hidden');
        if (wordCounter) wordCounter.classList.add('hidden');
        if (chatInput) chatInput.disabled = true;
    } else {
        feedbackArea.classList.add('hidden');
        proceedArea.classList.add('hidden');
        inputContainer.classList.remove('opacity-40', 'pointer-events-none', 'hidden');
        if (bottomHint) bottomHint.classList.remove('hidden');
        if (wordCounter) {
            const isRestricted = state.taskInfo && state.taskInfo.mode === 'Restricted';
            if (isRestricted) wordCounter.classList.remove('hidden');
        }
        if (chatInput) chatInput.disabled = false;
    }
}

function renderChat() {
    const isRestricted = state.taskInfo.mode === 'Restricted';
    state.lastActionTime = Date.now();
    container.innerHTML = `
        <div class="w-full max-w-3xl mx-auto space-y-8 flex flex-col mb-40 animate-in fade-in duration-700 mt-4">
            
            <!-- Task Instruction as Context/Initial AI Message -->
            <div class="self-start flex flex-col items-start w-full">
                <div class="flex items-start space-x-4">
                    <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                        <i data-lucide="bot" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
                    </div>
                    <div class="max-w-[85%] bg-gray-50 dark:bg-[#1a1a1a] text-black dark:text-gray-100 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-sm break-words">
                        <div class="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 select-none">
                            <i data-lucide="info" class="w-3 h-3"></i>
                            <span>Panduan Tugas - ${state.taskInfo.mode} Mode</span>
                        </div>
                        <div class="leading-relaxed font-medium text-base space-y-1">${parseMarkdown(
        state.taskInfo.teks_instruksi
            .split('\n')
            .filter(line => !line.trim().startsWith('Tujuan:'))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/menanggapi prompt/g, 'menanggapi task')
            .trim()
    )
        }</div>
                    </div>
                </div>
            </div>

            <div id="chat-history" class="space-y-8 flex flex-col w-full">
                <!-- Messages will appear here -->
            </div>
        </div>

        <!-- Chat Input Floating Bottom -->
        <div id="chat-input-wrapper" class="fixed bottom-6 left-0 right-0 z-40 pointer-events-none md:pl-72 transition-all">
            <div id="chat-interaction-area" class="w-full max-w-3xl mx-auto px-4 lg:px-8 flex flex-col pointer-events-auto">
                <!-- Feedback Opsi Area (Masih Kurang / Sudah Cukup & Lanjut) -->
                <div id="feedback-options-area" class="mb-3 hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p class="text-center text-xs text-gray-500 dark:text-gray-400 font-medium mb-2.5">Apakah jawaban dari AI dirasa sudah cukup? (pilih salah satu)</p>
                    <div class="flex justify-center gap-3">
                        <button onclick="handleKeepTyping()" class="inline-flex items-center justify-center px-5 py-2.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 font-semibold rounded-xl text-xs hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 transition-all outline-none border border-gray-300/60 dark:border-gray-600/60 shadow-sm cursor-pointer">
                            Masih Kurang
                        </button>
                        <button onclick="proceedNextStage()" class="inline-flex items-center justify-center px-5 py-2.5 bg-black text-white dark:bg-white dark:text-black font-semibold rounded-xl text-xs hover:opacity-90 active:scale-95 transition-all outline-none shadow-sm cursor-pointer">
                            Sudah Cukup & Lanjut ke Task Selanjutnya
                        </button>
                    </div>
                </div>

                <!-- Forced Proceed Area (when msgCount >= 3) -->
                <div id="optional-proceed-area" class="mb-3 flex justify-center hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <button onclick="proceedNextStage()" class="w-full py-3.5 bg-black text-white dark:bg-white dark:text-black font-semibold rounded-2xl text-xs hover:opacity-90 active:scale-95 transition-all outline-none shadow-lg cursor-pointer">
                        Sudah Cukup & Lanjut ke Task Berikutnya
                    </button>
                </div>
                
                <div id="word-counter-ui" class="px-2 py-1 flex justify-between items-center ${isRestricted ? '' : 'hidden'} mb-2 text-[11px] font-medium text-gray-500 transition-opacity">
                    <span class="opacity-70 italic">Maksimal 30 kata</span>
                    <span id="word-count-badge" class="font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800/50">0 / 30</span>
                </div>
                
                <div id="chat-input-container" class="relative flex items-end bg-gray-100/90 dark:bg-[#1f1f1f]/90 backdrop-blur-lg rounded-3xl p-1.5 pl-5 shadow-lg border border-gray-200/50 dark:border-white/10 focus-within:bg-white dark:focus-within:bg-[#2a2a2a] focus-within:shadow-xl transition-all">
                    <textarea id="chat-input" rows="1" oninput="handleTextareaInput(this)" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();sendMessage();}" placeholder="Ketik pesan Anda di sini..." class="w-full bg-transparent text-black dark:text-gray-100 border-none rounded-none py-2.5 flex-grow focus:outline-none focus:ring-0 transition-all resize-none overflow-hidden max-h-28 text-sm leading-relaxed"></textarea>
                    
                    <div class="flex items-center pr-1 gap-1 pb-0.5 shrink-0">
                         <button id="send-btn" onclick="sendMessage()" class="w-9 h-9 bg-black text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center hover:opacity-80 active:scale-95 disabled:opacity-30 disabled:grayscale transition-all shadow-md">
                            <i data-lucide="arrow-up" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
                
                <div id="chat-bottom-hint" class="text-center mt-2.5 text-[9px] text-gray-400 font-medium select-none flex items-center justify-center gap-1.5 opacity-60">
                    <i data-lucide="command" class="w-2.5 h-2.5"></i>
                    <span>Tekan Enter untuk kirim. AI dapat membantu menjawab instruksi eksperimen.</span>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();

    const historyContainer = document.getElementById('chat-history');

    if (state.chatHistory && state.chatHistory.length > 0) {
        state.chatHistory.forEach(msg => {
            if (msg.role === 'user') {
                historyContainer.insertAdjacentHTML('beforeend', `
                    <div class="self-end flex flex-col items-end w-full animate-in fade-in slide-in-from-right-4">
                        <div class="flex items-start flex-row-reverse gap-4">
                            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                                <i data-lucide="user" class="w-4 h-4 text-gray-700 dark:text-gray-300"></i>
                            </div>
                            <div class="chat-bubble-user max-w-[85%] bg-black text-white dark:bg-white dark:text-black p-4 rounded-2xl shadow-sm text-sm leading-relaxed font-medium">${escapeHtml(msg.text)}</div>
                        </div>
                    </div>
                `);
            } else {
                historyContainer.insertAdjacentHTML('beforeend', `
                    <div class="self-start flex flex-col items-start w-full animate-in fade-in slide-in-from-left-4 mt-6">
                        <div class="flex items-start gap-4">
                            <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                                <i data-lucide="bot" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
                            </div>
                            <div class="max-w-[85%] bg-gray-50 dark:bg-[#1a1a1a] text-black dark:text-gray-100 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-sm break-words leading-relaxed font-medium space-y-1">
                                ${parseMarkdown(msg.text)}
                            </div>
                        </div>
                    </div>
                `);
            }
        });
        lucide.createIcons();

        setTimeout(() => {
            const lastMsg = historyContainer.lastElementChild;
            if (lastMsg) {
                lastMsg.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
        }, 50);
    }

    const hasAiResponse = state.chatHistory && state.chatHistory.some(m => m.role === 'ai');
    if (hasAiResponse && state.msgCount >= 1 && state.msgCount < 3) {
        state.showFeedbackButtons = true;
    }

    updateChatControls();

    if (state.msgCount < 3) {
        const tx = document.getElementById('chat-input');
        if (tx) {
            tx.style.height = 'auto';
            tx.style.minHeight = '40px';
            tx.style.overflowY = 'hidden';
            tx.addEventListener("input", OnInput, false);
            function OnInput() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.scrollHeight > 120) {
                    this.style.overflowY = 'auto';
                } else {
                    this.style.overflowY = 'hidden';
                }
            }
            tx.focus();
        }
    }
}

function handleTextareaInput(el) {
    const words = el.value.trim().split(/\s+/).filter(w => w.length > 0);
    const count = words.length;
    const isRestricted = state.taskInfo.mode === 'Restricted';
    if (isRestricted) {
        const badge = document.getElementById('word-count-badge');
        const btn = document.getElementById('send-btn');
        badge.innerText = `${count} / 30`;

        if (count > 30) {
            badge.className = "font-mono bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-lg border border-red-100 dark:border-red-800/50 scale-105 transition-all";
            btn.disabled = true;
        } else {
            badge.className = "font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800/50";
            btn.disabled = count === 0;
        }
    } else {
        const btn = document.getElementById('send-btn');
        btn.disabled = count === 0;
    }
}

async function sendMessage() {
    if (state.showFeedbackButtons) return;

    const input = document.getElementById('chat-input');
    // msgRaw: pesan asli dengan newline dipertahankan untuk display & pengiriman ke backend
    // msgTrimmed: hanya untuk validasi kata (cek kosong & hitung kata)
    const msgRaw = input.value;
    const msgTrimmed = msgRaw.trim();
    if (!msgTrimmed) return;

    const now = Date.now();
    const waktu_berpikir_ms = state.lastActionTime ? (now - state.lastActionTime) : 0;

    const words = msgTrimmed.split(/\s+/).filter(w => w.length > 0);
    const count = words.length;
    const isRestricted = state.taskInfo && state.taskInfo.mode === 'Restricted';
    if (isRestricted && count > 30) {
        alert("Pesan Anda melebihi batasan 30 kata.");
        return;
    }

    // Gunakan msgTrimmed sebagai pesan final: sudah strip leading/trailing whitespace
    // tapi \n di tengah teks (baris baru antar paragraf) tetap terjaga
    const msg = msgTrimmed;

    state.showFeedbackButtons = false;
    updateChatControls();

    document.getElementById('send-btn').disabled = true;

    const history = document.getElementById('chat-history');

    history.insertAdjacentHTML('beforeend', `
        <div id="user-temp-msg" class="self-end flex flex-col items-end w-full animate-in fade-in slide-in-from-right-4">
            <div class="flex items-start flex-row-reverse gap-4">
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                    <i data-lucide="user" class="w-4 h-4 text-gray-700 dark:text-gray-300"></i>
                </div>
                <div class="chat-bubble-user max-w-[85%] bg-black text-white dark:bg-white dark:text-black p-4 rounded-2xl shadow-sm text-sm leading-relaxed font-medium">${escapeHtml(msg)}</div>
            </div>
        </div>
        <div id="loading-bubble" class="self-start flex flex-col items-start w-full animate-in fade-in slide-in-from-left-4 mt-6">
            <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                    <i data-lucide="bot" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
                </div>
                <div class="max-w-[85%] bg-gray-50 dark:bg-[#1a1a1a] text-black dark:text-gray-100 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-sm flex items-center gap-2">
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    <div class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
                </div>
            </div>
        </div>
    `);
    lucide.createIcons();

    input.value = '';
    input.style.height = 'auto';
    input.style.minHeight = '40px';

    const appContainer = document.getElementById('app-container');
    // Scroll ke loading bubble agar user tahu AI sedang memproses
    const loadingEl = document.getElementById('loading-bubble');
    if (loadingEl) {
        loadingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        appContainer.scrollTo({ top: appContainer.scrollHeight, behavior: 'smooth' });
    }

    let resp;
    try {
        resp = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_id: state.p_id, message: msg, waktu_berpikir_ms: waktu_berpikir_ms })
        });
    } catch (e) {
        const loadingBubble = document.getElementById('loading-bubble');
        if (loadingBubble) loadingBubble.remove();

        const userTempMsg = document.getElementById('user-temp-msg');
        if (userTempMsg) userTempMsg.remove();

        input.value = msg;
        handleTextareaInput(input);

        alert("Gagal menghubungi server. Pastikan koneksi internet aktif dan server backend berjalan.");
        document.getElementById('send-btn').disabled = false;
        return;
    }

    const loadingBubble = document.getElementById('loading-bubble');
    if (loadingBubble) loadingBubble.remove();

    if (resp.status !== 200) {
        const data = await resp.json().catch(() => ({}));
        alert(data.detail || "Terjadi kesalahan server.");

        const userTempMsg = document.getElementById('user-temp-msg');
        if (userTempMsg) userTempMsg.remove();

        input.value = msg;
        handleTextareaInput(input);

        document.getElementById('send-btn').disabled = false;
        return;
    }

    const userTempMsg = document.getElementById('user-temp-msg');
    if (userTempMsg) userTempMsg.removeAttribute('id');

    const data = await resp.json();

    // Deteksi apakah backend menandai ini sebagai error AI (is_error: true)
    if (data.is_error) {
        history.insertAdjacentHTML('beforeend', `
            <div class="self-start flex flex-col items-start w-full animate-in fade-in slide-in-from-left-4 mt-6">
                <div class="flex items-start gap-4">
                    <div class="w-8 h-8 rounded-full bg-red-950/60 dark:bg-red-950/80 border border-red-800/60 flex items-center justify-center shrink-0 mt-1">
                        <i data-lucide="alert-triangle" class="w-4 h-4 text-red-400"></i>
                    </div>
                    <div class="chat-bubble-error max-w-[85%] bg-red-950/40 dark:bg-red-950/50 text-red-300 p-4 rounded-2xl border border-red-800/50 shadow-sm text-sm leading-relaxed">
                        ${escapeHtml(data.ai_response || "Asisten AI sedang tidak dapat merespons saat ini. Mohon coba kirim pesan Anda kembali.")}
                    </div>
                </div>
            </div>
        `);
        lucide.createIcons();

        // Kembalikan input agar user bisa retry, tidak hitung sebagai pesan terpakai
        input.value = msg;
        handleTextareaInput(input);
        state.lastActionTime = Date.now();
        // Scroll ke atas error bubble agar terbaca dari awal
        const errorBubble = history.lastElementChild;
        if (errorBubble) {
            errorBubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        document.getElementById('send-btn').disabled = false;
        state.msgCount = data.msg_count;
        updateChatControls();
        return;
    }

    history.insertAdjacentHTML('beforeend', `
        <div class="self-start flex flex-col items-start w-full animate-in fade-in slide-in-from-left-4 mt-6">
            <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0 mt-1">
                    <i data-lucide="bot" class="w-5 h-5 text-gray-700 dark:text-gray-300"></i>
                </div>
                <div class="max-w-[85%] bg-gray-50 dark:bg-[#1a1a1a] text-black dark:text-gray-100 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-sm break-words leading-relaxed font-medium space-y-1">
                    ${parseMarkdown(data.ai_response)}
                </div>
            </div>
        </div>
    `);
    lucide.createIcons();
    state.lastActionTime = Date.now();

    // Scroll ke bagian ATAS bubble AI terbaru agar pengguna langsung
    // membaca awal jawaban tanpa perlu scroll up manual
    const aiBubble = history.lastElementChild;
    if (aiBubble) {
        aiBubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    state.msgCount = data.msg_count;
    if (data.stage_complete || state.msgCount >= 3) {
        state.showFeedbackButtons = false;
        updateChatControls();
    } else {
        state.showFeedbackButtons = true;
        updateChatControls();

        input.value = '';
        input.style.height = 'auto';
        input.style.minHeight = '40px';
        document.getElementById('send-btn').disabled = false;

        if (state.taskInfo.mode === 'Restricted') {
            const badge = document.getElementById('word-count-badge');
            badge.innerText = '0 / 30';
            badge.className = "font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800/50";
            document.getElementById('send-btn').disabled = true;
        }

        input.focus();
    }
}

function handleKeepTyping() {
    state.showFeedbackButtons = false;
    updateChatControls();
    const input = document.getElementById('chat-input');
    if (input) {
        input.disabled = false;
        input.focus();
    }
}

async function proceedNextStage() {
    state.showFeedbackButtons = false;
    await fetch(`${API_URL}/next-stage?p_id=${state.p_id}`, { method: 'POST' });
    await syncState();
    scrollToTop();
    render();
}

function renderFinal() {
    container.innerHTML = `
        <div class="glass p-12 w-full max-w-2xl text-center animate-in zoom-in-95 duration-1000 mt-20">
            <div class="w-20 h-20 bg-black text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                <i data-lucide="check" class="w-10 h-10"></i>
            </div>
            <h1 class="text-4xl font-light mb-4 text-black dark:text-white">Terima Kasih</h1>
            <p class="text-gray-500 leading-relaxed font-medium">Anda telah menyelesaikan seluruh rangkaian riset ini. Data yang Anda berikan akan digunakan untuk keperluan penelitian mengenai interaksi manusia dengan AI</p>
            <div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
                <p class="text-[10px] text-gray-400 uppercase tracking-[0.3em] font-bold">Session ID Reference</p>
                <p class="text-xs font-mono mt-2 text-gray-500">${state.p_id}</p>
            </div>
            <button onclick="restartSession()" class="mt-10 btn-monochrome w-full py-4 bg-transparent text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 font-bold rounded-2xl uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-gray-900 active:scale-95 transition-all flex items-center justify-center space-x-2">
                <i data-lucide="refresh-cw" class="w-5 h-5"></i>
                <span>Mulai Sesi Baru</span>
            </button>
        </div>
    `;
    lucide.createIcons();
}

function restartSession() {
    localStorage.removeItem('participant_id');
    window.location.href = `${window.location.origin}/`;
}

document.getElementById('theme-toggle').onclick = () => {
    state.isDark = !state.isDark;
    document.documentElement.classList.toggle('dark');
    document.body.classList.toggle('light');

    document.getElementById('theme-toggle').innerHTML = `<i data-lucide="${state.isDark ? 'moon' : 'sun'}" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>`;
    lucide.createIcons();
    updateMacroProgress();
};

init();

let lastScrollTop = 0;
const navbar = document.getElementById('main-nav');

// Scroll terjadi di #app-container (overflow-y: auto), bukan window
container.addEventListener('scroll', function () {
    let scrollTop = container.scrollTop;
    if (scrollTop > lastScrollTop) {
        navbar.style.transform = 'translateY(-100%)';
    } else {
        navbar.style.transform = 'translateY(0)';
        if (scrollTop > 10) {
            navbar.classList.add('border-gray-200', 'dark:border-gray-800', 'shadow-sm');
        } else {
            navbar.classList.remove('border-gray-200', 'dark:border-gray-800', 'shadow-sm');
        }
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
}, false);
