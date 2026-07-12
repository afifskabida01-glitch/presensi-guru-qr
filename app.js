/**
 * QRPresensi - Application Logic (Phase 2 - Advanced Schedule & Attendance)
 * Mengelola state guru, jadwal mengajar detail, riwayat presensi harian, modifikasi admin, dan simulator mobile.
 */

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================

const DEFAULT_TEACHERS = [];

// Helper untuk format tanggal
function getTodayDateStr() {
    return document.getElementById("manage-date") ? document.getElementById("manage-date").value : new Date().toISOString().split('T')[0];
}

let state = {
    teachers: DEFAULT_TEACHERS,
    schedules: [], // [{ teacherId, day, entries: [{kelas, jamMulai, mapel}] }]
    attendance: [], // [{ id, teacherId, teacherName, date, time, status, type, keterangan, acuanJam, acuanMapel }]
    settings: {
        defaultCheckIn: "07:00",
        picketDays: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    },
    activeToken: ""
};

let db = null;
let isFirebaseActive = false;

// ==========================================================================
// INIT & LOCAL STORAGE FALLBACK
// ==========================================================================

async function initDatabase() {
    const indicatorText = document.getElementById("storage-mode-text");
    const indicatorBox = document.getElementById("storage-mode-indicator");

    if (window.firebaseConfig && window.firebaseConfig.apiKey && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            firebase.initializeApp(window.firebaseConfig);
            db = firebase.firestore();
            isFirebaseActive = true;
            console.log("Firebase Firestore initialized successfully.");

            if (indicatorText && indicatorBox) {
                indicatorText.textContent = "Mode: Cloud Firestore";
                indicatorBox.classList.add("cloud");
            }
            // Implementation for Firebase reading/syncing would go here for a real production app.
            // For this prototype, we'll continue using LocalStorage for immediate interactivity if Firebase is not hooked up properly.
            setupLocalStorageFallback();
        } catch (e) {
            console.error("Gagal inisialisasi Firebase. Beralih ke LocalStorage fallback.", e);
            setupLocalStorageFallback();
        }
    } else {
        console.log("Menggunakan penyimpanan lokal browser (LocalStorage).");
        setupLocalStorageFallback();
    }
}

function setupLocalStorageFallback() {
    // SISTEM VERSI CACHE
    const APP_VERSION = "prod-3.0";
    const storedVersion = localStorage.getItem('qr_presensi_version');

    if (storedVersion !== APP_VERSION) {
        console.log("Versi cache berbeda. Menghapus data lama dan memulai bersih...");
        localStorage.removeItem('qr_presensi_teachers');
        localStorage.removeItem('qr_presensi_attendance');
        localStorage.removeItem('qr_presensi_settings');
        localStorage.removeItem('qr_presensi_schedules');
        localStorage.setItem('qr_presensi_version', APP_VERSION);
    }

    state.teachers = JSON.parse(localStorage.getItem('qr_presensi_teachers')) || [];
    state.schedules = JSON.parse(localStorage.getItem('qr_presensi_schedules')) || [];
    state.attendance = JSON.parse(localStorage.getItem('qr_presensi_attendance')) || [];
    state.settings = JSON.parse(localStorage.getItem('qr_presensi_settings')) || {
        defaultCheckIn: "07:00",
        picketDays: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    };
    
    // UI Init
    document.getElementById("set-default-checkin").value = state.settings.defaultCheckIn;
    document.getElementById("manage-date").value = new Date().toISOString().split('T')[0];
    
    renderDashboardStats();
    renderLiveFeed();
    renderTeachersTable();
    populateTeacherDropdowns();
    renderManageAttendanceTable();
    renderReports();
}

function saveStateToLocal() {
    if (!isFirebaseActive) {
        localStorage.setItem('qr_presensi_teachers', JSON.stringify(state.teachers));
        localStorage.setItem('qr_presensi_schedules', JSON.stringify(state.schedules));
        localStorage.setItem('qr_presensi_attendance', JSON.stringify(state.attendance));
        localStorage.setItem('qr_presensi_settings', JSON.stringify(state.settings));
    }
}

// Digunakan oleh tombol reset merah di tab pengaturan
window.resetDatabaseLocal = function() {
    if(confirm("PERINGATAN: Semua data guru, jadwal, dan riwayat presensi akan dihapus permanen dari browser ini. Lanjutkan?")) {
        localStorage.clear();
        alert("Data berhasil dibersihkan. Aplikasi akan dimuat ulang.");
        location.reload();
    }
}

// ==========================================================================
// CORE LOGIC: PENENTUAN STATUS & ACUAN JAM
// ==========================================================================

function getDayName(dateObj) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[dateObj.getDay()];
}

function getAcuanHadir(teacher, dateObj) {
    const dayName = getDayName(dateObj);
    
    // 1. Cek Jadwal Mengajar hari ini
    const schedule = state.schedules.find(s => s.teacherId === teacher.id && s.day === dayName);
    if (schedule && schedule.entries && schedule.entries.length > 0) {
        // Cari jam mulai paling awal
        const sortedEntries = [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
        const firstEntry = sortedEntries[0];
        return {
            jam: firstEntry.jamMulai,
            mapel: `${firstEntry.mapel} (${firstEntry.kelas})`,
            wajibHadir: true
        };
    }
    
    // 2. Cek Piket
    if (teacher.picketDay === dayName) {
        return {
            jam: teacher.picketCheckIn || "06:45",
            mapel: "Guru Piket",
            wajibHadir: true
        };
    }
    
    // 3. Tidak ada jadwal & piket
    return {
        jam: "-",
        mapel: "Tidak Wajib Hadir",
        wajibHadir: false
    };
}

function determineStatus(timeScanned, acuanJam) {
    if (acuanJam === "-") return "Tepat Waktu"; // Jika tidak wajib hadir tapi absen
    
    // Bandingkan string jam (format "HH:MM")
    // Misal: timeScanned "07:05:23", acuanJam "07:00"
    const scanned = timeScanned.substring(0, 5);
    
    if (scanned <= acuanJam) {
        return "Tepat Waktu";
    } else {
        return "Terlambat";
    }
}

// ==========================================================================
// QR GENERATION & CLOCK
// ==========================================================================

let qrHelper = null;
let lastRenderedToken = "";

function updateClock() {
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('id-ID');
    document.getElementById('phone-time').textContent = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', options);
    
    // Phone UI Day
    const dayName = getDayName(now);
    const dayBadge = document.getElementById('sim-today-day');
    if(dayBadge) dayBadge.textContent = dayName;

    // QR Token generation (rotates every minute for demo)
    const tokenStr = "QR-" + now.getFullYear() + (now.getMonth()+1) + now.getDate() + "-" + now.getHours() + now.getMinutes();
    
    if (tokenStr !== lastRenderedToken && qrHelper) {
        state.activeToken = btoa(tokenStr).substring(0, 10);
        document.getElementById('active-token').textContent = state.activeToken;
        document.getElementById('qr-code-display').innerHTML = qrHelper.generateMockSVG(state.activeToken);
        lastRenderedToken = tokenStr;
    }
}

document.getElementById("btn-regenerate-qr").addEventListener("click", () => {
    lastRenderedToken = ""; // Force regenerate
    updateClock();
});

// ==========================================================================
// UI TABS NAVIGATION
// ==========================================================================

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        item.classList.add('active');
        const tabId = 'tab-' + item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        if(tabId === 'tab-manage') renderManageAttendanceTable();
        if(tabId === 'tab-reports') renderReports();
        if(tabId === 'tab-jadwal') populateJadwalGrid();
    });
});

// ==========================================================================
// DASHBOARD & FEED
// ==========================================================================

function renderDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    document.getElementById("stat-total-teachers").textContent = state.teachers.length;
    
    const present = todaysLogs.filter(log => (log.type === 'hadir' || !log.type) && log.status === 'Tepat Waktu').length;
    const late = todaysLogs.filter(log => (log.type === 'hadir' || !log.type) && log.status === 'Terlambat').length;
    const izin = todaysLogs.filter(log => log.type === 'izin' || log.type === 'sakit').length;
    
    document.getElementById("stat-present-teachers").textContent = present;
    document.getElementById("stat-late-teachers").textContent = late;
    document.getElementById("stat-izin-teachers").textContent = izin;
}

function renderLiveFeed() {
    const feedContainer = document.getElementById("feed-scans-list");
    const countBadge = document.getElementById("feed-count");
    
    const today = new Date().toISOString().split('T')[0];
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    todaysLogs.sort((a, b) => new Date(`1970/01/01 ${b.time}`) - new Date(`1970/01/01 ${a.time}`));
    
    countBadge.textContent = `${todaysLogs.length} Presensi`;
    
    if (todaysLogs.length === 0) {
        feedContainer.innerHTML = `
            <div class="feed-empty">
                <i class="fa-solid fa-clipboard-question"></i>
                <p>Belum ada presensi hari ini.</p>
            </div>
        `;
        return;
    }
    
    feedContainer.innerHTML = "";
    
    todaysLogs.forEach(log => {
        const item = document.createElement("div");
        
        // CSS class berdasarkan status/type
        let statusClass = "tepat-waktu";
        let badgeClass = "badge-success";
        
        if (log.type === 'izin') {
            statusClass = "izin"; badgeClass = "badge-info";
        } else if (log.type === 'sakit') {
            statusClass = "sakit"; badgeClass = "badge-secondary";
        } else if (log.status === "Terlambat") {
            statusClass = "terlambat"; badgeClass = "badge-warning";
        } else if (log.status === "Alpa") {
            statusClass = "terlambat"; badgeClass = "badge-danger";
        }
        
        item.className = `feed-item ${statusClass}`;
        
        const initials = log.teacherName.split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase();
        
        let descHtml = `<p>${log.acuanMapel || 'Hadir'}</p>`;
        if(log.type === 'izin' || log.type === 'sakit') descHtml = `<p>${log.keterangan || 'Tidak ada keterangan'}</p>`;
        
        item.innerHTML = `
            <div class="feed-user">
                <div class="feed-avatar">${initials}</div>
                <div class="feed-info">
                    <h4>${log.teacherName}</h4>
                    ${descHtml}
                </div>
            </div>
            <div class="feed-time-status">
                <span class="feed-time">${log.time.substring(0, 5)}</span>
                <span class="badge ${badgeClass}">${log.type === 'hadir' ? log.status : log.type}</span>
            </div>
        `;
        feedContainer.appendChild(item);
    });
}

// ==========================================================================
// MANAJEMEN GURU (CRUD)
// ==========================================================================

function renderTeachersTable() {
    const tbody = document.getElementById("teachers-list-body");
    const searchTerm = document.getElementById("search-teacher").value.toLowerCase();
    const filterPicket = document.getElementById("filter-picket-day").value;
    
    tbody.innerHTML = "";
    
    let filtered = state.teachers.filter(t => {
        const matchSearch = t.name.toLowerCase().includes(searchTerm) || t.nip.includes(searchTerm);
        const matchPicket = filterPicket === "" || t.picketDay === filterPicket;
        return matchSearch && matchPicket;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--text-muted); padding: 32px;">Tidak ada data guru ditemukan.</td></tr>`;
        return;
    }
    
    filtered.forEach(t => {
        const tr = document.createElement("tr");
        const initials = t.name.split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase();
        
        let picketBadge = t.picketDay !== "Tidak Ada" 
            ? `<span class="badge badge-info">${t.picketDay}</span>` 
            : `<span style="color:var(--text-muted); font-size:12px;">-</span>`;
            
        tr.innerHTML = `
            <td>
                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 13px; border: 1px solid var(--border-glass-light); color: var(--color-primary);">
                    ${initials}
                </div>
            </td>
            <td style="font-weight: 600;">${t.name}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${t.nip}</td>
            <td>${picketBadge}</td>
            <td style="font-weight:600;">${t.picketDay !== "Tidak Ada" ? t.picketCheckIn : '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-icon schedule" onclick="openJadwalForTeacher('${t.id}')" title="Atur Jadwal Mengajar"><i class="fa-solid fa-calendar-week"></i></button>
                    <button class="btn-icon edit" onclick="editTeacher('${t.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="deleteTeacher('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById("search-teacher").addEventListener("input", renderTeachersTable);
document.getElementById("filter-picket-day").addEventListener("change", renderTeachersTable);

// Teacher Modal
const teacherModal = document.getElementById("teacher-modal");
const formTeacher = document.getElementById("form-teacher");

document.getElementById("btn-add-teacher-modal").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Tambah Data Guru";
    formTeacher.reset();
    document.getElementById("teacher-id").value = "";
    teacherModal.classList.remove("hidden");
});

document.getElementById("btn-close-teacher-modal").addEventListener("click", () => teacherModal.classList.add("hidden"));
document.getElementById("btn-cancel-teacher").addEventListener("click", () => teacherModal.classList.add("hidden"));

formTeacher.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("teacher-id").value || "T" + Date.now();
    const name = document.getElementById("teacher-name").value;
    const nip = document.getElementById("teacher-nip").value;
    const picketDay = document.getElementById("teacher-picket").value;
    const picketCheckIn = document.getElementById("teacher-checkin").value;
    
    const existingIndex = state.teachers.findIndex(t => t.id === id);
    const newData = { id, name, nip, picketDay, picketCheckIn };
    
    if (existingIndex >= 0) {
        state.teachers[existingIndex] = newData;
    } else {
        state.teachers.push(newData);
    }
    
    saveStateToLocal();
    renderTeachersTable();
    populateTeacherDropdowns();
    renderDashboardStats();
    teacherModal.classList.add("hidden");
});

window.editTeacher = function(id) {
    const t = state.teachers.find(t => t.id === id);
    if (!t) return;
    
    document.getElementById("modal-title").textContent = "Edit Data Guru";
    document.getElementById("teacher-id").value = t.id;
    document.getElementById("teacher-name").value = t.name;
    document.getElementById("teacher-nip").value = t.nip;
    document.getElementById("teacher-picket").value = t.picketDay;
    document.getElementById("teacher-checkin").value = t.picketCheckIn || "07:00";
    
    teacherModal.classList.remove("hidden");
}

window.deleteTeacher = function(id) {
    if (confirm("Hapus data guru ini?")) {
        state.teachers = state.teachers.filter(t => t.id !== id);
        saveStateToLocal();
        renderTeachersTable();
        populateTeacherDropdowns();
        renderDashboardStats();
    }
}

// ==========================================================================
// JADWAL MENGAJAR (PHASE 2)
// ==========================================================================

const selectJadwalTeacher = document.getElementById("select-jadwal-teacher");

function populateTeacherDropdowns() {
    // Populate for Jadwal
    selectJadwalTeacher.innerHTML = '<option value="">-- Pilih Guru --</option>';
    
    // Populate for Simulator & Admin Attendance
    const simSelect = document.getElementById("select-sim-teacher");
    const attSelect = document.getElementById("att-teacher-id");
    
    if(simSelect) simSelect.innerHTML = '<option value="">-- Sentuh untuk Pilih Akun --</option>';
    if(attSelect) attSelect.innerHTML = '';

    state.teachers.forEach(t => {
        selectJadwalTeacher.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        if(simSelect) simSelect.innerHTML += `<option value="${t.id}">${t.name} (NIP: ${t.nip})</option>`;
        if(attSelect) attSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
    
    if(simSelect) updateSimulatorTeacherProfile();
}

selectJadwalTeacher.addEventListener("change", populateJadwalGrid);

function populateJadwalGrid() {
    const teacherId = selectJadwalTeacher.value;
    const grid = document.getElementById("jadwal-week-grid");
    
    if (!teacherId) {
        grid.innerHTML = `
            <div class="feed-empty" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                <i class="fa-solid fa-calendar-week" style="font-size: 36px; margin-bottom: 12px; color: var(--text-muted);"></i>
                <p style="color: var(--text-muted);">Pilih guru di atas untuk melihat dan mengatur jadwal mengajarnya.</p>
            </div>
        `;
        return;
    }
    
    const teacher = state.teachers.find(t => t.id === teacherId);
    grid.innerHTML = "";
    
    const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    
    days.forEach(day => {
        // Cari jadwal guru ini untuk hari ini
        const schedule = state.schedules.find(s => s.teacherId === teacherId && s.day === day);
        const entries = schedule ? schedule.entries : [];
        
        // Cek piket
        const isPiket = teacher.picketDay === day;
        const piketHtml = isPiket ? `<div class="jadwal-piket-badge"><i class="fa-solid fa-broom"></i> Piket (${teacher.picketCheckIn})</div>` : '';
        
        let entriesHtml = "";
        if (entries.length === 0) {
            entriesHtml = `<div class="jadwal-empty-state">Tidak ada jadwal</div>`;
        } else {
            // Sort by time
            entries.sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
            entries.forEach((e, idx) => {
                entriesHtml += `
                    <div class="jadwal-entry ${idx === 0 ? 'first' : ''}">
                        <div class="jadwal-entry-time">${e.jamMulai} ${idx === 0 ? '<i class="fa-solid fa-flag-checkered" title="Acuan Keterlambatan" style="color:var(--color-success)"></i>' : ''}</div>
                        <div class="jadwal-entry-meta">${e.mapel}<br>${e.kelas}</div>
                    </div>
                `;
            });
        }
        
        grid.innerHTML += `
            <div class="jadwal-day-card" onclick="openJadwalModal('${day}')">
                <div class="jadwal-day-header ${isPiket ? 'has-piket' : ''}">${day}</div>
                <div class="jadwal-day-body">
                    ${piketHtml}
                    ${entriesHtml}
                </div>
            </div>
        `;
    });
}

window.openJadwalForTeacher = function(teacherId) {
    // Pindah ke tab jadwal
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector('.nav-item[data-tab="jadwal"]').classList.add('active');
    document.getElementById('tab-jadwal').classList.add('active');
    
    selectJadwalTeacher.value = teacherId;
    populateJadwalGrid();
}

// Jadwal Modal Logic
const jadwalModal = document.getElementById("jadwal-modal");
const jadwalContainer = document.getElementById("jadwal-entries-container");

window.openJadwalModal = function(day) {
    const teacherId = selectJadwalTeacher.value;
    const teacher = state.teachers.find(t => t.id === teacherId);
    
    document.getElementById("jadwal-teacher-name-display").value = teacher.name;
    document.getElementById("jadwal-teacher-id").value = teacherId;
    document.getElementById("jadwal-day-display").value = day;
    document.getElementById("jadwal-day").value = day;
    
    const schedule = state.schedules.find(s => s.teacherId === teacherId && s.day === day);
    jadwalContainer.innerHTML = "";
    
    if (schedule && schedule.entries.length > 0) {
        schedule.entries.forEach(e => addJadwalEntryRow(e.jamMulai, e.mapel, e.kelas));
    } else {
        addJadwalEntryRow(); // Add 1 empty row
    }
    
    jadwalModal.classList.remove("hidden");
}

function addJadwalEntryRow(jam = "07:00", mapel = "", kelas = "") {
    const div = document.createElement("div");
    div.className = "jadwal-modal-entry-row";
    div.innerHTML = `
        <div class="form-group" style="width: 100px;">
            <label style="font-size:11px;">Jam Mulai</label>
            <input type="time" class="j-jam" value="${jam}" required>
        </div>
        <div class="form-group" style="flex:1;">
            <label style="font-size:11px;">Mata Pelajaran</label>
            <input type="text" class="j-mapel" value="${mapel}" placeholder="Cth: Matematika" required>
        </div>
        <div class="form-group" style="width: 100px;">
            <label style="font-size:11px;">Kelas</label>
            <input type="text" class="j-kelas" value="${kelas}" placeholder="Cth: X-1" required>
        </div>
        <button type="button" class="btn-icon delete" style="margin-bottom: 2px;" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    jadwalContainer.appendChild(div);
}

document.getElementById("btn-add-jadwal-entry").addEventListener("click", () => addJadwalEntryRow());
document.getElementById("btn-close-jadwal-modal").addEventListener("click", () => jadwalModal.classList.add("hidden"));
document.getElementById("btn-cancel-jadwal").addEventListener("click", () => jadwalModal.classList.add("hidden"));

document.getElementById("btn-save-jadwal").addEventListener("click", () => {
    const teacherId = document.getElementById("jadwal-teacher-id").value;
    const day = document.getElementById("jadwal-day").value;
    
    const rows = jadwalContainer.querySelectorAll(".jadwal-modal-entry-row");
    const entries = [];
    
    rows.forEach(row => {
        entries.push({
            jamMulai: row.querySelector(".j-jam").value,
            mapel: row.querySelector(".j-mapel").value,
            kelas: row.querySelector(".j-kelas").value
        });
    });
    
    // Simpan ke state
    const existingIndex = state.schedules.findIndex(s => s.teacherId === teacherId && s.day === day);
    if (existingIndex >= 0) {
        state.schedules[existingIndex].entries = entries;
    } else {
        state.schedules.push({ teacherId, day, entries });
    }
    
    saveStateToLocal();
    populateJadwalGrid(); // update UI
    
    // Update simulator UI if this teacher is currently selected
    if(document.getElementById("select-sim-teacher").value === teacherId) {
        updateSimulatorScheduleUI();
    }
    
    jadwalModal.classList.add("hidden");
});

// ==========================================================================
// KELOLA KEHADIRAN ADMIN (PHASE 2)
// ==========================================================================

const manageDateInput = document.getElementById("manage-date");
manageDateInput.addEventListener("change", renderManageAttendanceTable);

function renderManageAttendanceTable() {
    const tbody = document.getElementById("manage-attendance-body");
    const targetDate = manageDateInput.value;
    
    if(!targetDate) return;
    
    const dateObj = new Date(targetDate);
    
    // Gabungkan list guru dengan attendance log mereka hari itu
    tbody.innerHTML = "";
    
    if (state.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--text-muted);">Belum ada data guru.</td></tr>`;
        return;
    }
    
    state.teachers.forEach(teacher => {
        // Cari presensi untuk guru ini di tanggal ini
        const log = state.attendance.find(a => a.teacherId === teacher.id && a.date === targetDate);
        
        // Tentukan acuan jam
        const acuan = getAcuanHadir(teacher, dateObj);
        
        const tr = document.createElement("tr");
        
        let statusHtml = '<span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-secondary)">Belum Hadir</span>';
        let waktuHtml = '-';
        let ketHtml = '-';
        let actBtns = `
            <button class="btn-icon edit" title="Tambah/Ubah" onclick="openAttendanceModal('${teacher.id}', '${targetDate}', null)"><i class="fa-solid fa-pen-to-square"></i></button>
        `;
        
        if (log) {
            waktuHtml = `<strong>${log.time.substring(0,5)}</strong>`;
            if (log.type === 'izin') statusHtml = '<span class="badge badge-info">Izin</span>';
            else if (log.type === 'sakit') statusHtml = '<span class="badge badge-secondary">Sakit</span>';
            else if (log.status === 'Terlambat') statusHtml = '<span class="badge badge-warning">Terlambat</span>';
            else if (log.status === 'Alpa') statusHtml = '<span class="badge badge-danger">Alpa</span>';
            else statusHtml = '<span class="badge badge-success">Tepat Waktu</span>';
            
            if (log.keterangan) ketHtml = `<span style="font-size:12px; color:var(--text-secondary)">${log.keterangan}</span>`;
            
            actBtns = `
                <button class="btn-icon edit" title="Ubah" onclick="openAttendanceModal('${teacher.id}', '${targetDate}', '${log.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-icon delete" title="Hapus" onclick="deleteAttendance('${log.id}')"><i class="fa-solid fa-trash"></i></button>
            `;
        } else if (!acuan.wajibHadir) {
            statusHtml = '<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted)">Libur/Kosong</span>';
        }
        
        const acuanHtml = `<div style="font-size:12px;"><strong style="color:var(--text-main)">${acuan.jam}</strong><br><span style="color:var(--text-secondary)">${acuan.mapel}</span></div>`;

        tr.innerHTML = `
            <td style="font-weight: 600;">${teacher.name}</td>
            <td>${acuanHtml}</td>
            <td>${waktuHtml}</td>
            <td class="text-center">${statusHtml}</td>
            <td>${ketHtml}</td>
            <td><div class="action-buttons">${actBtns}</div></td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Attendance
const attModal = document.getElementById("attendance-modal");
const formAtt = document.getElementById("form-attendance");

window.openAttendanceModal = function(teacherId, date, logId) {
    document.getElementById("att-id").value = logId || "";
    document.getElementById("att-teacher-id").value = teacherId;
    document.getElementById("att-date").value = date;
    
    // Set default values based on schedule
    const teacher = state.teachers.find(t => t.id === teacherId);
    const dateObj = new Date(date);
    const acuan = getAcuanHadir(teacher, dateObj);
    
    if (logId) {
        const log = state.attendance.find(a => a.id === logId);
        document.getElementById("att-time").value = log.time.substring(0,5);
        document.getElementById("att-status").value = log.type === 'hadir' ? log.status : (log.type.charAt(0).toUpperCase() + log.type.slice(1));
        document.getElementById("att-keterangan").value = log.keterangan || "";
    } else {
        document.getElementById("att-time").value = acuan.jam !== "-" ? acuan.jam : "07:00";
        document.getElementById("att-status").value = "Tepat Waktu";
        document.getElementById("att-keterangan").value = "";
    }
    
    attModal.classList.remove("hidden");
}

document.getElementById("btn-add-manual-attendance").addEventListener("click", () => {
    if(state.teachers.length === 0) return alert("Belum ada data guru");
    openAttendanceModal(state.teachers[0].id, manageDateInput.value, null);
});

document.getElementById("btn-close-attendance-modal").addEventListener("click", () => attModal.classList.add("hidden"));
document.getElementById("btn-cancel-attendance").addEventListener("click", () => attModal.classList.add("hidden"));

formAtt.addEventListener("submit", (e) => {
    e.preventDefault();
    const logId = document.getElementById("att-id").value;
    const teacherId = document.getElementById("att-teacher-id").value;
    const date = document.getElementById("att-date").value;
    const timeVal = document.getElementById("att-time").value;
    const statusVal = document.getElementById("att-status").value;
    const keterangan = document.getElementById("att-keterangan").value;
    
    const teacher = state.teachers.find(t => t.id === teacherId);
    const acuan = getAcuanHadir(teacher, new Date(date));
    
    let type = 'hadir';
    let finalStatus = statusVal;
    
    if (statusVal === 'Izin' || statusVal === 'Sakit' || statusVal === 'Alpa') {
        type = statusVal.toLowerCase();
        finalStatus = '-'; // Tidak relevan untuk terlambat/tepat waktu jika izin/sakit
    }

    const newData = {
        id: logId || "L" + Date.now(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: date,
        time: timeVal.length === 5 ? timeVal + ":00" : timeVal,
        status: finalStatus,
        type: type,
        keterangan: keterangan,
        acuanJam: acuan.jam,
        acuanMapel: acuan.mapel,
        editedByAdmin: true
    };
    
    if (logId) {
        const idx = state.attendance.findIndex(a => a.id === logId);
        state.attendance[idx] = newData;
    } else {
        state.attendance.push(newData);
    }
    
    saveStateToLocal();
    renderManageAttendanceTable();
    renderDashboardStats();
    renderLiveFeed();
    if(document.getElementById("select-sim-teacher").value === teacherId) {
        updateSimulatorScheduleUI();
        renderSimulatorLogs(teacherId);
    }
    attModal.classList.add("hidden");
});

window.deleteAttendance = function(logId) {
    if (confirm("Hapus data presensi ini?")) {
        state.attendance = state.attendance.filter(a => a.id !== logId);
        saveStateToLocal();
        renderManageAttendanceTable();
        renderDashboardStats();
        renderLiveFeed();
        
        // Refresh simulator if needed
        const currentSimTeacher = document.getElementById("select-sim-teacher").value;
        if(currentSimTeacher) {
            updateSimulatorScheduleUI();
            renderSimulatorLogs(currentSimTeacher);
        }
    }
}

// ==========================================================================
// SIMULATOR GURU
// ==========================================================================

const simSelectTeacher = document.getElementById("select-sim-teacher");

simSelectTeacher.addEventListener("change", () => {
    updateSimulatorTeacherProfile();
    updateSimulatorScheduleUI();
    
    if (simSelectTeacher.value) {
        renderSimulatorLogs(simSelectTeacher.value);
    } else {
        document.getElementById("sim-personal-logs").innerHTML = "";
    }
});

function updateSimulatorTeacherProfile() {
    const id = simSelectTeacher.value;
    const nameEl = document.getElementById("sim-teacher-name");
    const nipEl = document.getElementById("sim-teacher-nip");
    const initEl = document.getElementById("sim-teacher-initials");
    
    if (!id) {
        nameEl.textContent = "Pilih Guru";
        nipEl.textContent = "NIP: -";
        initEl.textContent = "--";
        document.getElementById("btn-trigger-scan").disabled = true;
        document.getElementById("btn-lapor-izin").disabled = true;
        return;
    }
    
    const t = state.teachers.find(t => t.id === id);
    if (t) {
        nameEl.textContent = t.name;
        nipEl.textContent = "NIP: " + t.nip;
        initEl.textContent = t.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
        document.getElementById("btn-trigger-scan").disabled = false;
        document.getElementById("btn-lapor-izin").disabled = false;
    }
}

function updateSimulatorScheduleUI() {
    const id = simSelectTeacher.value;
    const box = document.getElementById("sim-attendance-status-box");
    const text = document.getElementById("sim-attendance-status-text");
    const list = document.getElementById("sim-today-schedule-list");
    
    if (!id) {
        box.className = "attendance-status-box";
        box.innerHTML = `<i class="fa-solid fa-circle-question"></i> <span id="sim-attendance-status-text">Pilih akun terlebih dahulu</span>`;
        list.innerHTML = "";
        return;
    }

    const teacher = state.teachers.find(t => t.id === id);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayName = getDayName(today);
    
    // Cek jadwal hari ini
    const schedule = state.schedules.find(s => s.teacherId === id && s.day === dayName);
    const isPiket = teacher.picketDay === dayName;
    
    let listHtml = "";
    if (isPiket) {
        listHtml += `<div class="sim-sched-item ${(!schedule || schedule.entries.length===0) ? 'first' : ''}">
            <div><i class="fa-solid fa-broom" style="color:var(--color-warning)"></i> <span class="time">${teacher.picketCheckIn || '06:45'}</span></div>
            <div class="detail">Guru Piket</div>
        </div>`;
    }
    
    if (schedule && schedule.entries.length > 0) {
        const sorted = [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
        sorted.forEach((e, idx) => {
            listHtml += `<div class="sim-sched-item ${(!isPiket && idx === 0) ? 'first' : ''}">
                <div class="time">${e.jamMulai}</div>
                <div class="detail">${e.mapel} (${e.kelas})</div>
            </div>`;
        });
    } else if (!isPiket) {
        listHtml = `<div style="text-align:center; padding:10px; font-size:12px; color:var(--text-muted);">Libur / Tidak ada jadwal hari ini</div>`;
    }
    
    list.innerHTML = listHtml;
    
    // Cek status presensi hari ini
    const log = state.attendance.find(a => a.teacherId === id && a.date === todayStr);
    
    if (log) {
        if (log.type === 'izin') {
            box.className = "attendance-status-box info";
            box.innerHTML = `<i class="fa-solid fa-file-medical"></i> <span>Telah Lapor Izin</span>`;
        } else if (log.type === 'sakit') {
            box.className = "attendance-status-box secondary";
            box.innerHTML = `<i class="fa-solid fa-house-medical"></i> <span>Telah Lapor Sakit</span>`;
        } else if (log.status === "Terlambat") {
            box.className = "attendance-status-box warning";
            box.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <span>Terlambat (${log.time.substring(0,5)})</span>`;
        } else {
            box.className = "attendance-status-box success";
            box.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Hadir (${log.time.substring(0,5)})</span>`;
        }
    } else {
        box.className = "attendance-status-box";
        box.innerHTML = `<i class="fa-solid fa-circle-question"></i> <span>Belum Presensi</span>`;
    }
}

// SCANNER FLOW
const scannerOverlay = document.getElementById("scanner-view-overlay");
const successDialog = document.getElementById("success-dialog");

document.getElementById("btn-trigger-scan").addEventListener("click", () => {
    if (!simSelectTeacher.value) return alert("Pilih akun guru terlebih dahulu");
    if (!state.activeToken) return alert("QR Code admin tidak aktif");
    
    scannerOverlay.classList.remove("hidden");
    
    setTimeout(() => {
        scannerOverlay.classList.add("hidden");
        processAttendance(simSelectTeacher.value, state.activeToken);
    }, 2000);
});

document.getElementById("btn-close-scanner").addEventListener("click", () => {
    scannerOverlay.classList.add("hidden");
});

function processAttendance(teacherId, scannedToken) {
    if (scannedToken !== state.activeToken) {
        alert("QR Code tidak valid atau sudah kadaluarsa. Silakan scan ulang.");
        return;
    }
    
    const teacher = state.teachers.find(t => t.id === teacherId);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-GB'); // "HH:MM:SS"
    
    // Cegah double scan
    if (state.attendance.find(a => a.teacherId === teacherId && a.date === todayStr)) {
        alert("Anda sudah melakukan presensi hari ini.");
        return;
    }
    
    // Tentukan Acuan
    const acuan = getAcuanHadir(teacher, now);
    const status = determineStatus(timeStr, acuan.jam);
    
    const newRecord = {
        id: "L" + Date.now(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: todayStr,
        time: timeStr,
        status: status,
        type: 'hadir',
        keterangan: '',
        acuanJam: acuan.jam,
        acuanMapel: acuan.mapel
    };
    
    state.attendance.push(newRecord);
    saveStateToLocal();
    
    // Show Success Dialog
    document.getElementById("success-time").textContent = timeStr.substring(0,5);
    document.getElementById("success-acuan").textContent = acuan.jam !== "-" ? acuan.jam : "Bebas (Tidak ada jadwal)";
    
    const badge = document.getElementById("success-status-badge");
    badge.textContent = status;
    badge.className = "badge " + (status === "Tepat Waktu" ? "badge-success" : "badge-warning");
    
    successDialog.classList.remove("hidden");
    
    // Update UI Background
    renderDashboardStats();
    renderLiveFeed();
    updateSimulatorScheduleUI();
    renderSimulatorLogs(teacherId);
    
    // Jika admin sedang di tab manage attendance hari ini
    if(manageDateInput && manageDateInput.value === todayStr) {
        renderManageAttendanceTable();
    }
}

document.getElementById("btn-close-success").addEventListener("click", () => {
    successDialog.classList.add("hidden");
});

// IZIN FLOW
const izinOverlay = document.getElementById("izin-overlay");

document.getElementById("btn-lapor-izin").addEventListener("click", () => {
    if (!simSelectTeacher.value) return alert("Pilih akun guru terlebih dahulu");
    
    // Cek apakah sudah absen hari ini
    const todayStr = new Date().toISOString().split('T')[0];
    const exists = state.attendance.find(a => a.teacherId === simSelectTeacher.value && a.date === todayStr);
    if(exists) {
        return alert("Anda sudah memiliki catatan presensi / izin hari ini.");
    }
    
    document.getElementById("izin-type").value = "izin";
    document.getElementById("izin-keterangan").value = "";
    izinOverlay.classList.remove("hidden");
});

document.getElementById("btn-close-izin").addEventListener("click", () => izinOverlay.classList.add("hidden"));

document.getElementById("btn-submit-izin").addEventListener("click", () => {
    const teacherId = simSelectTeacher.value;
    const type = document.getElementById("izin-type").value;
    const ket = document.getElementById("izin-keterangan").value;
    
    if(!ket.trim()) return alert("Keterangan/alasan wajib diisi!");
    
    const teacher = state.teachers.find(t => t.id === teacherId);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-GB'); 
    
    const acuan = getAcuanHadir(teacher, now);
    
    const newRecord = {
        id: "L" + Date.now(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: todayStr,
        time: timeStr,
        status: "-",
        type: type,
        keterangan: ket,
        acuanJam: acuan.jam,
        acuanMapel: acuan.mapel
    };
    
    state.attendance.push(newRecord);
    saveStateToLocal();
    
    izinOverlay.classList.add("hidden");
    alert(`Laporan ${type} berhasil dikirim ke Admin.`);
    
    renderDashboardStats();
    renderLiveFeed();
    updateSimulatorScheduleUI();
    renderSimulatorLogs(teacherId);
    if(manageDateInput && manageDateInput.value === todayStr) renderManageAttendanceTable();
});


function renderSimulatorLogs(teacherId) {
    const container = document.getElementById("sim-personal-logs");
    const logs = state.attendance.filter(a => a.teacherId === teacherId).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5); // Ambil 5 terakhir
    
    if (logs.length === 0) {
        container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); text-align:center;">Belum ada riwayat</p>`;
        return;
    }
    
    container.innerHTML = "";
    logs.forEach(log => {
        let badge = "";
        if(log.type === 'izin') badge = `<span class="badge badge-info" style="font-size:10px;">Izin</span>`;
        else if(log.type === 'sakit') badge = `<span class="badge badge-secondary" style="font-size:10px;">Sakit</span>`;
        else if (log.status === "Terlambat") badge = `<span class="badge badge-warning" style="font-size:10px;">Terlambat</span>`;
        else badge = `<span class="badge badge-success" style="font-size:10px;">Tepat</span>`;
        
        container.innerHTML += `
            <div class="personal-log-item">
                <div>
                    <div class="log-date">${log.date}</div>
                    <div class="log-time">${log.time.substring(0,5)} • ${log.acuanMapel || 'Hadir'}</div>
                </div>
                ${badge}
            </div>
        `;
    });
}

// ==========================================================================
// REPORTS
// ==========================================================================

const selectReportMonth = document.getElementById("select-report-month");

function initReportMonthSelect() {
    const now = new Date();
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    selectReportMonth.innerHTML = "";
    // 3 bulan terakhir
    for(let i=0; i<3; i++) {
        let m = now.getMonth() - i;
        let y = now.getFullYear();
        if(m < 0) { m += 12; y -= 1; }
        
        const valStr = `${y}-${(m+1).toString().padStart(2, '0')}`;
        const txtStr = `${months[m]} ${y}`;
        selectReportMonth.innerHTML += `<option value="${valStr}">${txtStr}</option>`;
    }
}
initReportMonthSelect();
selectReportMonth.addEventListener("change", renderReports);

function renderReports() {
    const tbody = document.getElementById("report-list-body");
    const targetMonth = selectReportMonth.value; // format YYYY-MM
    
    tbody.innerHTML = "";
    
    if (state.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:var(--text-muted);">Tidak ada data guru.</td></tr>`;
        return;
    }
    
    // Filter log bulan ini
    const monthLogs = state.attendance.filter(log => log.date.startsWith(targetMonth));
    
    state.teachers.forEach(teacher => {
        const teacherLogs = monthLogs.filter(log => log.teacherId === teacher.id);
        
        const tepat = teacherLogs.filter(log => log.type === 'hadir' && log.status === 'Tepat Waktu').length;
        const lambat = teacherLogs.filter(log => log.type === 'hadir' && log.status === 'Terlambat').length;
        const izin = teacherLogs.filter(log => log.type === 'izin').length;
        const sakit = teacherLogs.filter(log => log.type === 'sakit').length;
        const alpa = teacherLogs.filter(log => log.type === 'alpa').length;
        const hadirTotal = tepat + lambat;
        
        // Skor Sederhana (contoh: Hadir tepat = 100, Terlambat = 50, Izin/Sakit = 80, Alpa = 0)
        let totalScore = 0;
        let countedDays = 0;
        
        if (teacherLogs.length > 0) {
            teacherLogs.forEach(l => {
                if(l.type === 'hadir' && l.status === 'Tepat Waktu') totalScore += 100;
                else if(l.type === 'hadir' && l.status === 'Terlambat') totalScore += 50;
                else if(l.type === 'izin' || l.type === 'sakit') totalScore += 80;
                else if(l.type === 'alpa') totalScore += 0;
                countedDays++;
            });
            totalScore = Math.round(totalScore / countedDays);
        }
        
        let scoreColor = "var(--color-success)";
        if(totalScore < 80) scoreColor = "var(--color-warning)";
        if(totalScore < 60) scoreColor = "var(--color-danger)";

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:600;">${teacher.name}</td>
                <td class="text-center"><strong>${hadirTotal}</strong></td>
                <td class="text-center" style="color:var(--color-success)">${tepat}</td>
                <td class="text-center" style="color:var(--color-warning)">${lambat}</td>
                <td class="text-center" style="color:var(--color-info)">${izin}</td>
                <td class="text-center" style="color:var(--color-secondary)">${sakit}</td>
                <td class="text-center" style="color:var(--color-danger)">${alpa}</td>
                <td class="text-right"><span class="badge" style="background:transparent; border-color:${scoreColor}; color:${scoreColor}">${totalScore}/100</span></td>
            </tr>
        `;
    });
}

// Export CSV Simple
document.getElementById("btn-export-csv").addEventListener("click", () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Nama Guru,Total Hadir,Tepat Waktu,Terlambat,Izin,Sakit,Alpa,Skor\n";
    
    const rows = document.querySelectorAll("#report-list-body tr");
    rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        if(cols.length > 1) {
            const rowData = Array.from(cols).map(c => `"${c.innerText}"`).join(",");
            csvContent += rowData + "\n";
        }
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Presensi_${selectReportMonth.value}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

document.getElementById("btn-export-pdf").addEventListener("click", () => {
    window.print();
});

// ==========================================================================
// STARTUP
// ==========================================================================

// Fake QR generator for standalone prototype without external lib
if (!window.QRHelper) {
    console.log("Loading fallback QR Helper");
    qrHelper = {
        generateMockSVG: (text) => {
            return `<div style="text-align:center; padding:20px; border:2px dashed #ccc; border-radius:10px;">
                        <i class="fa-solid fa-qrcode" style="font-size:64px; color:#3b82f6; margin-bottom:10px;"></i>
                        <p style="font-size:12px; font-weight:bold; word-break:break-all;">${text}</p>
                    </div>`;
        }
    }
} else {
    qrHelper = new QRHelper();
}

window.addEventListener("load", () => {
    initDatabase();
    setInterval(updateClock, 1000);
    updateClock(); // first run
});
