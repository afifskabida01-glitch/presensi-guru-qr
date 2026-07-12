/**
 * QRPresensi - Application Logic (Phase 3 - Role-Based & Check-Out)
 * Mengelola sistem login, pemisahan UI Admin/Guru, absen pulang, dan kelola admin.
 */

// ==========================================================================
// STATE MANAGEMENT & DATA MODEL
// ==========================================================================

const APP_VERSION = "prod-4.0"; // Versi cache (Fase 3)

let state = {
    teachers: [],
    schedules: [],
    attendance: [], // { id, teacherId, date, timeIn, timeOut, statusIn, statusOut, type, keterangan, acuanJam }
    admins: [{ id: "admin1", username: "admin", password: "123", role: "superadmin" }], // Default admin
    settings: { defaultCheckIn: "07:00" },
    activeToken: ""
};

let currentUser = null; // { role: 'admin'|'guru', data: {} }
let db = null;
let qrHelper = null;
let lastRenderedToken = "";

// ==========================================================================
// INIT & LOCAL STORAGE
// ==========================================================================

function setupLocalStorage() {
    const storedVersion = localStorage.getItem('qr_presensi_version');

    if (storedVersion !== APP_VERSION) {
        console.log("Versi cache berbeda. Menghapus data lama (APP_VERSION 4.0)...");
        localStorage.clear();
        localStorage.setItem('qr_presensi_version', APP_VERSION);
    }

    state.teachers = JSON.parse(localStorage.getItem('qr_presensi_teachers')) || [];
    state.schedules = JSON.parse(localStorage.getItem('qr_presensi_schedules')) || [];
    state.attendance = JSON.parse(localStorage.getItem('qr_presensi_attendance')) || [];
    state.admins = JSON.parse(localStorage.getItem('qr_presensi_admins')) || [{ id: "admin1", username: "admin", password: "123", role: "superadmin" }];
    
    // Check if logged in
    const session = sessionStorage.getItem('qr_presensi_session');
    if (session) {
        currentUser = JSON.parse(session);
    }
}

function saveStateToLocal() {
    localStorage.setItem('qr_presensi_teachers', JSON.stringify(state.teachers));
    localStorage.setItem('qr_presensi_schedules', JSON.stringify(state.schedules));
    localStorage.setItem('qr_presensi_attendance', JSON.stringify(state.attendance));
    localStorage.setItem('qr_presensi_admins', JSON.stringify(state.admins));
}

window.resetDatabaseLocal = function() {
    if(confirm("PERINGATAN: Semua data guru, jadwal, dan riwayat presensi akan dihapus permanen. Lanjutkan?")) {
        localStorage.clear();
        sessionStorage.clear();
        alert("Data berhasil dibersihkan. Aplikasi akan dimuat ulang.");
        location.reload();
    }
}

// ==========================================================================
// CORE LOGIC: PENENTUAN STATUS & JAM
// ==========================================================================

function getDayName(dateObj) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[dateObj.getDay()];
}

function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

function getAcuanHadir(teacher, dateObj) {
    const dayName = getDayName(dateObj);
    const schedule = state.schedules.find(s => s.teacherId === teacher.id && s.day === dayName);
    
    if (schedule && schedule.entries && schedule.entries.length > 0) {
        const sortedEntries = [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
        return {
            jam: sortedEntries[0].jamMulai,
            mapel: `${sortedEntries[0].mapel} (${sortedEntries[0].kelas})`,
            wajibHadir: true
        };
    }
    
    if (teacher.picketDay === dayName) {
        return {
            jam: teacher.picketCheckIn || "06:45",
            mapel: "Guru Piket",
            wajibHadir: true
        };
    }
    
    return { jam: "-", mapel: "Tidak Wajib Hadir", wajibHadir: false };
}

function determineStatusIn(timeScanned, acuanJam) {
    if (acuanJam === "-") return "Tepat Waktu";
    return (timeScanned.substring(0, 5) <= acuanJam) ? "Tepat Waktu" : "Terlambat";
}

// ==========================================================================
// ROUTING & VIEW CONTROLLER
// ==========================================================================

function navigateTo(viewId) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function checkSession() {
    if (!currentUser) {
        navigateTo('view-login');
        renderLoginDropdown();
    } else if (currentUser.role === 'admin') {
        navigateTo('view-admin');
        initAdminView();
    } else if (currentUser.role === 'guru') {
        navigateTo('view-guru');
        initGuruView();
    }
}

// ==========================================================================
// LOGIN SYSTEM
// ==========================================================================

const loginTabs = document.querySelectorAll('.login-tab-btn');
loginTabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
        loginTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        
        document.querySelectorAll('.login-form-container').forEach(c => c.classList.remove('active'));
        document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
    });
});

function renderLoginDropdown() {
    const select = document.getElementById("login-select-guru");
    select.innerHTML = '<option value="">-- Pilih Nama Anda --</option>';
    state.teachers.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.name} (NIP: ${t.nip})</option>`;
    });
}

document.getElementById("btn-login-guru").addEventListener('click', () => {
    const tId = document.getElementById("login-select-guru").value;
    if (!tId) return alert("Pilih nama Anda!");
    const tData = state.teachers.find(t => t.id === tId);
    
    currentUser = { role: 'guru', data: tData };
    sessionStorage.setItem('qr_presensi_session', JSON.stringify(currentUser));
    checkSession();
});

document.getElementById("btn-login-admin").addEventListener('click', () => {
    const user = document.getElementById("login-admin-user").value;
    const pass = document.getElementById("login-admin-pass").value;
    
    const adminMatch = state.admins.find(a => a.username === user && a.password === pass);
    if (adminMatch) {
        currentUser = { role: 'admin', data: adminMatch };
        sessionStorage.setItem('qr_presensi_session', JSON.stringify(currentUser));
        document.getElementById("login-admin-user").value = '';
        document.getElementById("login-admin-pass").value = '';
        checkSession();
    } else {
        alert("Username atau password salah!");
    }
});

document.getElementById("btn-logout-admin").addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('qr_presensi_session');
    checkSession();
});

document.getElementById("btn-logout-guru").addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('qr_presensi_session');
    checkSession();
});

// ==========================================================================
// VIEW: GURU (MOBILE APP)
// ==========================================================================

function initGuruView() {
    const t = currentUser.data;
    document.getElementById("guru-name-display").textContent = t.name;
    document.getElementById("guru-avatar-init").textContent = t.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    
    const now = new Date();
    document.getElementById("guru-today-day").textContent = getDayName(now);
    
    // Render Schedule List
    const scheduleBox = document.getElementById("guru-schedule-list");
    const dayName = getDayName(now);
    const schedule = state.schedules.find(s => s.teacherId === t.id && s.day === dayName);
    
    let schHtml = "";
    if (t.picketDay === dayName) {
        schHtml += `<div class="sim-sched-item"><div class="time">${t.picketCheckIn || '06:45'}</div><div class="detail">Guru Piket</div></div>`;
    }
    if (schedule && schedule.entries.length > 0) {
        [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai)).forEach((e, idx) => {
            schHtml += `<div class="sim-sched-item"><div class="time">${e.jamMulai}</div><div class="detail">${e.mapel} (${e.kelas})</div></div>`;
        });
    }
    if (schHtml === "") schHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px;">Libur / Tidak ada jadwal mengajar.</div>`;
    scheduleBox.innerHTML = schHtml;
    
    updateGuruStatusAndBtn();
    renderGuruHistory();
}

function updateGuruStatusAndBtn() {
    const t = currentUser.data;
    const todayStr = getTodayDateStr();
    const log = state.attendance.find(a => a.teacherId === t.id && a.date === todayStr);
    
    const statusInd = document.getElementById("guru-status-indicator");
    const btnScan = document.getElementById("btn-trigger-scan");
    const btnText = document.getElementById("scan-btn-text");
    const btnHint = document.getElementById("scan-hint-text");
    const btnIzin = document.getElementById("btn-lapor-izin");
    
    btnIzin.style.display = "block"; // Reset default
    btnScan.className = "btn-scan-main"; // Reset
    btnScan.disabled = false;
    
    if (!log) {
        statusInd.className = "status-indicator";
        statusInd.innerHTML = `<i class="fa-solid fa-circle-question"></i> <span>Belum Absen</span>`;
        btnText.textContent = "Absen Datang";
        btnHint.textContent = "Ketuk untuk memindai QR Datang";
    } else {
        btnIzin.style.display = "none"; // Hide izin if already have log
        
        if (log.type === 'izin' || log.type === 'sakit') {
            statusInd.className = "status-indicator info";
            statusInd.innerHTML = `<i class="fa-solid fa-file-medical"></i> <span>Sedang ${log.type.toUpperCase()}</span>`;
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnText.textContent = "Tidak Bisa Absen";
            btnHint.textContent = "Anda sudah lapor izin hari ini";
        } else if (!log.timeOut) {
            // Sudah absen datang, belum pulang
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = `<i class="fa-solid fa-sign-in-alt"></i> <span>Hadir (Datang: ${log.timeIn.substring(0,5)})</span>`;
            
            btnScan.className = "btn-scan-main mode-checkout"; // Orange mode
            btnText.textContent = "Absen Pulang";
            btnHint.textContent = "Ketuk untuk memindai QR Pulang";
        } else {
            // Sudah absen datang dan pulang
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = `<i class="fa-solid fa-check-double"></i> <span>Selesai (Pulang: ${log.timeOut.substring(0,5)})</span>`;
            
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnText.textContent = "Tugas Selesai";
            btnHint.textContent = "Anda sudah absen pulang hari ini";
        }
    }
}

function renderGuruHistory() {
    const list = document.getElementById("guru-personal-logs");
    const t = currentUser.data;
    const logs = state.attendance.filter(a => a.teacherId === t.id).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (logs.length === 0) {
        list.innerHTML = `<p style="font-size:13px; color:var(--text-muted); text-align:center;">Belum ada riwayat presensi.</p>`;
        return;
    }
    
    list.innerHTML = "";
    logs.forEach(log => {
        let badge = "";
        if(log.type === 'izin') badge = `<span class="badge badge-info">Izin</span>`;
        else if(log.type === 'sakit') badge = `<span class="badge badge-secondary">Sakit</span>`;
        else badge = `<span class="badge ${log.statusIn === 'Terlambat' ? 'badge-warning' : 'badge-success'}">In: ${log.timeIn.substring(0,5)}</span>`;
        
        let outBadge = log.timeOut ? `<span class="badge badge-secondary" style="margin-left:4px;">Out: ${log.timeOut.substring(0,5)}</span>` : '';
        
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:8px;">
                <div><div style="font-weight:600; font-size:13px;">${log.date}</div><div style="font-size:11px; color:var(--text-secondary)">${log.acuanMapel || '-'}</div></div>
                <div>${badge}${outBadge}</div>
            </div>
        `;
    });
}

// SCANNER (GURU)
const scannerOverlay = document.getElementById("scanner-view-overlay");
const successDialog = document.getElementById("success-dialog");

document.getElementById("btn-trigger-scan").addEventListener("click", () => {
    scannerOverlay.classList.remove("hidden");
    
    // Simulate scan delay
    setTimeout(() => {
        scannerOverlay.classList.add("hidden");
        
        // Cek token validitas (untuk demo kita asumsikan guru melihat token valid di HP-nya yang disesuaikan dgn proyektor admin)
        // Di real-world, guru akan mengakses kamera dan membaca QR Code.
        // Untuk simulasi ini, kita by-pass pengecekan token spesifik karena HP dan Admin di layar terpisah.
        processAttendance(currentUser.data.id);
    }, 1500);
});

document.getElementById("btn-close-scanner").addEventListener("click", () => scannerOverlay.classList.add("hidden"));

function processAttendance(teacherId) {
    const teacher = state.teachers.find(t => t.id === teacherId);
    const now = new Date();
    const todayStr = getTodayDateStr();
    const timeStr = now.toLocaleTimeString('en-GB');
    
    let log = state.attendance.find(a => a.teacherId === teacherId && a.date === todayStr);
    
    if (!log) {
        // ABSEN DATANG
        const acuan = getAcuanHadir(teacher, now);
        const status = determineStatusIn(timeStr, acuan.jam);
        
        log = {
            id: "L" + Date.now(),
            teacherId: teacher.id,
            teacherName: teacher.name,
            date: todayStr,
            timeIn: timeStr,
            timeOut: "",
            statusIn: status,
            statusOut: "",
            type: 'hadir',
            keterangan: '',
            acuanJam: acuan.jam,
            acuanMapel: acuan.mapel
        };
        state.attendance.push(log);
        
        showSuccessDialog("Absen Datang", timeStr, log.statusIn);
        
    } else if (!log.timeOut && log.type === 'hadir') {
        // ABSEN PULANG
        log.timeOut = timeStr;
        log.statusOut = "Selesai";
        
        showSuccessDialog("Absen Pulang", timeStr, log.statusOut);
    }
    
    saveStateToLocal();
    initGuruView(); // Refresh UI
}

function showSuccessDialog(type, time, status) {
    document.getElementById("success-time").textContent = time.substring(0,5);
    document.getElementById("success-acuan").textContent = type;
    document.getElementById("success-status-badge").textContent = status;
    document.getElementById("success-status-badge").className = "badge " + (status === 'Terlambat' ? 'badge-warning' : 'badge-success');
    successDialog.classList.remove("hidden");
}

document.getElementById("btn-close-success").addEventListener("click", () => successDialog.classList.add("hidden"));

// IZIN (GURU)
const izinOverlay = document.getElementById("izin-overlay");
document.getElementById("btn-lapor-izin").addEventListener("click", () => {
    document.getElementById("izin-type").value = "izin";
    document.getElementById("izin-keterangan").value = "";
    izinOverlay.classList.remove("hidden");
});
document.getElementById("btn-close-izin").addEventListener("click", () => izinOverlay.classList.add("hidden"));

document.getElementById("btn-submit-izin").addEventListener("click", () => {
    const type = document.getElementById("izin-type").value;
    const ket = document.getElementById("izin-keterangan").value;
    
    if(!ket.trim()) return alert("Keterangan/alasan wajib diisi!");
    
    const teacher = currentUser.data;
    const now = new Date();
    
    const newRecord = {
        id: "L" + Date.now(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: getTodayDateStr(),
        timeIn: now.toLocaleTimeString('en-GB'),
        timeOut: "",
        statusIn: "-",
        statusOut: "-",
        type: type,
        keterangan: ket,
        acuanJam: "-",
        acuanMapel: "-"
    };
    
    state.attendance.push(newRecord);
    saveStateToLocal();
    
    izinOverlay.classList.add("hidden");
    alert(`Laporan ${type} berhasil dikirim ke Admin.`);
    initGuruView();
});

// ==========================================================================
// VIEW: ADMIN
// ==========================================================================

function initAdminView() {
    document.getElementById("admin-name-display").textContent = currentUser.data.username;
    
    // Inisialisasi input tanggal
    const dt = document.getElementById("manage-date");
    if (!dt.value) dt.value = getTodayDateStr();
    
    renderDashboardStats();
    renderLiveFeed();
    renderTeachersTable();
    populateTeacherDropdownsAdmin();
    renderManageAttendanceTable();
    renderAdminsTable();
    renderReports();
    
    setInterval(updateAdminClock, 1000);
}

function updateAdminClock() {
    if(currentUser?.role !== 'admin') return;
    
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('id-ID');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', options);
    
    const tokenStr = "QR-" + now.getFullYear() + (now.getMonth()+1) + now.getDate() + "-" + now.getHours() + now.getMinutes();
    
    if (tokenStr !== lastRenderedToken && qrHelper) {
        state.activeToken = btoa(tokenStr).substring(0, 10);
        document.getElementById('active-token').textContent = state.activeToken;
        document.getElementById('qr-code-display').innerHTML = qrHelper.generateMockSVG(state.activeToken);
        lastRenderedToken = tokenStr;
    }
}

document.getElementById("btn-regenerate-qr").addEventListener("click", () => { lastRenderedToken = ""; updateAdminClock(); });

// TABS ADMIN
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        item.classList.add('active');
        const tabId = 'tab-' + item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        if(tabId === 'tab-manage') renderManageAttendanceTable();
        if(tabId === 'tab-reports') renderReports();
        if(tabId === 'tab-jadwal') populateJadwalGrid();
    });
});

// ADMIN: DASHBOARD
function renderDashboardStats() {
    const today = getTodayDateStr();
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    document.getElementById("stat-total-teachers").textContent = state.teachers.length;
    document.getElementById("stat-present-teachers").textContent = todaysLogs.filter(log => (log.type === 'hadir') && log.statusIn === 'Tepat Waktu').length;
    document.getElementById("stat-late-teachers").textContent = todaysLogs.filter(log => (log.type === 'hadir') && log.statusIn === 'Terlambat').length;
    document.getElementById("stat-izin-teachers").textContent = todaysLogs.filter(log => log.type === 'izin' || log.type === 'sakit').length;
}

function renderLiveFeed() {
    const feedContainer = document.getElementById("feed-scans-list");
    const today = getTodayDateStr();
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    document.getElementById("feed-count").textContent = `${todaysLogs.length} Aktivitas`;
    
    if (todaysLogs.length === 0) {
        feedContainer.innerHTML = `<div class="feed-empty"><p>Belum ada presensi hari ini.</p></div>`;
        return;
    }
    
    feedContainer.innerHTML = "";
    
    // Sort log (tampilkan log pulangnya juga jika ada)
    let feedItems = [];
    todaysLogs.forEach(l => {
        feedItems.push({ name: l.teacherName, time: l.timeIn, action: l.type === 'hadir' ? l.statusIn : l.type.toUpperCase(), ket: l.acuanMapel || l.keterangan });
        if (l.timeOut) {
            feedItems.push({ name: l.teacherName, time: l.timeOut, action: "Pulang", ket: "Selesai" });
        }
    });
    
    feedItems.sort((a,b) => new Date(`1970/01/01 ${b.time}`) - new Date(`1970/01/01 ${a.time}`));
    
    feedItems.forEach(item => {
        let badge = "badge-success";
        if (item.action === 'Terlambat') badge = "badge-warning";
        else if (item.action === 'Pulang') badge = "badge-secondary";
        else if (item.action === 'IZIN' || item.action === 'SAKIT') badge = "badge-info";
        
        feedContainer.innerHTML += `
            <div class="feed-item">
                <div class="feed-user">
                    <div class="feed-avatar">${item.name.substring(0,2).toUpperCase()}</div>
                    <div class="feed-info">
                        <h4>${item.name}</h4>
                        <p>${item.ket}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <span class="feed-time">${item.time.substring(0,5)}</span><br>
                    <span class="badge ${badge}">${item.action}</span>
                </div>
            </div>
        `;
    });
}

// ADMIN: GURU & JADWAL (CRUD) -- Identik dengan Phase 2
function renderTeachersTable() {
    const tbody = document.getElementById("teachers-list-body");
    const search = document.getElementById("search-teacher") ? document.getElementById("search-teacher").value.toLowerCase() : "";
    
    tbody.innerHTML = "";
    const filtered = state.teachers.filter(t => t.name.toLowerCase().includes(search));
    
    filtered.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td><div class="feed-avatar">${t.name.substring(0,2).toUpperCase()}</div></td>
                <td>${t.name}</td><td>${t.nip}</td><td>${t.picketDay}</td><td>${t.picketCheckIn || '-'}</td>
                <td><div class="action-buttons"><button class="btn-icon" onclick="openJadwalForTeacher('${t.id}')"><i class="fa-solid fa-calendar-week"></i></button><button class="btn-icon" onclick="editTeacher('${t.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" onclick="deleteTeacher('${t.id}')"><i class="fa-solid fa-trash"></i></button></div></td>
            </tr>
        `;
    });
}
document.getElementById("search-teacher")?.addEventListener("input", renderTeachersTable);

const teacherModal = document.getElementById("teacher-modal");
document.getElementById("btn-add-teacher-modal").addEventListener("click", () => {
    document.getElementById("form-teacher").reset();
    document.getElementById("teacher-id").value = "";
    teacherModal.classList.remove("hidden");
});
document.getElementById("btn-close-teacher-modal").addEventListener("click", () => teacherModal.classList.add("hidden"));
document.getElementById("form-teacher").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("teacher-id").value || "T" + Date.now();
    const newData = {
        id,
        name: document.getElementById("teacher-name").value,
        nip: document.getElementById("teacher-nip").value,
        picketDay: document.getElementById("teacher-picket").value,
        picketCheckIn: document.getElementById("teacher-checkin").value
    };
    const idx = state.teachers.findIndex(t => t.id === id);
    if (idx >= 0) state.teachers[idx] = newData; else state.teachers.push(newData);
    
    saveStateToLocal();
    renderTeachersTable();
    populateTeacherDropdownsAdmin();
    teacherModal.classList.add("hidden");
});
window.editTeacher = function(id) {
    const t = state.teachers.find(t => t.id === id);
    if (!t) return;
    document.getElementById("teacher-id").value = t.id;
    document.getElementById("teacher-name").value = t.name;
    document.getElementById("teacher-nip").value = t.nip;
    document.getElementById("teacher-picket").value = t.picketDay;
    document.getElementById("teacher-checkin").value = t.picketCheckIn || "07:00";
    teacherModal.classList.remove("hidden");
}
window.deleteTeacher = function(id) {
    if (confirm("Hapus guru ini?")) { state.teachers = state.teachers.filter(t => t.id !== id); saveStateToLocal(); renderTeachersTable(); populateTeacherDropdownsAdmin(); }
}

function populateTeacherDropdownsAdmin() {
    const s1 = document.getElementById("select-jadwal-teacher");
    const s2 = document.getElementById("att-teacher-id");
    if(s1) s1.innerHTML = '<option value="">-- Pilih Guru --</option>';
    if(s2) s2.innerHTML = '';
    state.teachers.forEach(t => {
        if(s1) s1.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        if(s2) s2.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

const selectJadwalTeacher = document.getElementById("select-jadwal-teacher");
selectJadwalTeacher?.addEventListener("change", populateJadwalGrid);
function populateJadwalGrid() {
    const tId = selectJadwalTeacher.value;
    const grid = document.getElementById("jadwal-week-grid");
    if(!tId) { grid.innerHTML = `<p style="padding:20px; grid-column:1/-1;">Pilih guru terlebih dahulu.</p>`; return; }
    
    const t = state.teachers.find(x => x.id === tId);
    grid.innerHTML = "";
    ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].forEach(day => {
        const sch = state.schedules.find(s => s.teacherId === tId && s.day === day);
        let eHtml = "";
        if (sch && sch.entries.length > 0) {
            sch.entries.forEach(e => eHtml += `<div class="jadwal-entry">${e.jamMulai} - ${e.mapel} (${e.kelas})</div>`);
        }
        grid.innerHTML += `
            <div class="jadwal-day-card" onclick="openJadwalModal('${day}')">
                <div class="jadwal-day-header">${day}</div>
                <div class="jadwal-day-body">${eHtml}</div>
            </div>
        `;
    });
}
window.openJadwalForTeacher = function(id) {
    navItems.forEach(n => n.classList.remove('active')); document.querySelector('[data-tab="jadwal"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.getElementById('tab-jadwal').classList.add('active');
    selectJadwalTeacher.value = id; populateJadwalGrid();
}

const jadwalModal = document.getElementById("jadwal-modal");
window.openJadwalModal = function(day) {
    document.getElementById("jadwal-teacher-id").value = selectJadwalTeacher.value;
    document.getElementById("jadwal-day").value = day;
    document.getElementById("jadwal-day-display").value = day;
    document.getElementById("jadwal-entries-container").innerHTML = "";
    addJadwalEntryRow();
    jadwalModal.classList.remove("hidden");
}
document.getElementById("btn-close-jadwal-modal").addEventListener("click", () => jadwalModal.classList.add("hidden"));
document.getElementById("btn-add-jadwal-entry").addEventListener("click", () => addJadwalEntryRow());
function addJadwalEntryRow() {
    const div = document.createElement("div"); div.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom:5px;">
            <input type="time" class="j-jam" value="07:00" required>
            <input type="text" class="j-mapel" placeholder="Mapel" required>
            <input type="text" class="j-kelas" placeholder="Kelas" required>
        </div>`;
    document.getElementById("jadwal-entries-container").appendChild(div);
}
document.getElementById("btn-save-jadwal").addEventListener("click", () => {
    const tId = document.getElementById("jadwal-teacher-id").value;
    const day = document.getElementById("jadwal-day").value;
    const entries = [];
    document.getElementById("jadwal-entries-container").querySelectorAll("div > div").forEach(row => {
        entries.push({ jamMulai: row.querySelector(".j-jam").value, mapel: row.querySelector(".j-mapel").value, kelas: row.querySelector(".j-kelas").value });
    });
    const idx = state.schedules.findIndex(s => s.teacherId === tId && s.day === day);
    if(idx >= 0) state.schedules[idx].entries = entries; else state.schedules.push({teacherId:tId, day, entries});
    saveStateToLocal(); populateJadwalGrid(); jadwalModal.classList.add("hidden");
});

// ADMIN: KELOLA KEHADIRAN (DENGAN JAM PULANG)
document.getElementById("manage-date")?.addEventListener("change", renderManageAttendanceTable);
function renderManageAttendanceTable() {
    const tbody = document.getElementById("manage-attendance-body");
    const tDate = document.getElementById("manage-date").value;
    tbody.innerHTML = "";
    
    state.teachers.forEach(t => {
        const log = state.attendance.find(a => a.teacherId === t.id && a.date === tDate);
        const acuan = getAcuanHadir(t, new Date(tDate));
        
        let actBtns = `<button class="btn-icon" onclick="openAttendanceModal('${t.id}','${tDate}',null)"><i class="fa-solid fa-pen"></i></button>`;
        let hHtml = `<td>${t.name}</td><td>${acuan.jam}</td><td>-</td><td>-</td><td>-</td><td>-</td><td>${actBtns}</td>`;
        
        if (log) {
            actBtns = `<button class="btn-icon" onclick="openAttendanceModal('${t.id}','${tDate}','${log.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" onclick="deleteAttendance('${log.id}')"><i class="fa-solid fa-trash"></i></button>`;
            hHtml = `<td>${t.name}</td><td>${acuan.jam}</td><td>${log.timeIn.substring(0,5)}</td><td>${log.timeOut ? log.timeOut.substring(0,5) : '-'}</td><td><span class="badge ${log.statusIn==='Terlambat'?'badge-warning':(log.type==='hadir'?'badge-success':'badge-info')}">${log.type==='hadir'?log.statusIn:log.type}</span></td><td>${log.keterangan||'-'}</td><td><div class="action-buttons">${actBtns}</div></td>`;
        }
        tbody.innerHTML += `<tr>${hHtml}</tr>`;
    });
}

const attModal = document.getElementById("attendance-modal");
window.openAttendanceModal = function(tId, date, logId) {
    document.getElementById("att-id").value = logId || "";
    document.getElementById("att-teacher-id").value = tId;
    document.getElementById("att-date").value = date;
    
    if (logId) {
        const log = state.attendance.find(a => a.id === logId);
        document.getElementById("att-time").value = log.timeIn.substring(0,5);
        document.getElementById("att-time-out").value = log.timeOut ? log.timeOut.substring(0,5) : "";
        document.getElementById("att-status").value = log.type==='hadir' ? log.statusIn : (log.type.charAt(0).toUpperCase()+log.type.slice(1));
        document.getElementById("att-keterangan").value = log.keterangan||"";
    } else {
        document.getElementById("att-time").value = "07:00";
        document.getElementById("att-time-out").value = "";
    }
    attModal.classList.remove("hidden");
}
document.getElementById("btn-close-attendance-modal").addEventListener("click", () => attModal.classList.add("hidden"));
document.getElementById("form-attendance").addEventListener("submit", (e) => {
    e.preventDefault();
    const lId = document.getElementById("att-id").value;
    const tId = document.getElementById("att-teacher-id").value;
    const t = state.teachers.find(x => x.id === tId);
    
    const timeIn = document.getElementById("att-time").value + ":00";
    let timeOut = document.getElementById("att-time-out").value;
    if(timeOut) timeOut += ":00";
    
    const st = document.getElementById("att-status").value;
    const newData = {
        id: lId || "L"+Date.now(), teacherId: tId, teacherName: t.name, date: document.getElementById("att-date").value,
        timeIn, timeOut, statusIn: st==='Izin'||st==='Sakit'||st==='Alpa'?'-':st, type: st==='Izin'||st==='Sakit'||st==='Alpa'?st.toLowerCase():'hadir',
        keterangan: document.getElementById("att-keterangan").value, acuanJam: getAcuanHadir(t, new Date()).jam
    };
    
    if(lId) { const idx = state.attendance.findIndex(a => a.id === lId); state.attendance[idx] = newData; }
    else state.attendance.push(newData);
    
    saveStateToLocal(); renderManageAttendanceTable(); attModal.classList.add("hidden");
});
window.deleteAttendance = function(id) { if(confirm("Hapus log presensi ini?")) { state.attendance = state.attendance.filter(a => a.id !== id); saveStateToLocal(); renderManageAttendanceTable(); } }

// ADMIN: KELOLA ADMIN BARU
function renderAdminsTable() {
    const tbody = document.getElementById("admins-list-body");
    tbody.innerHTML = "";
    state.admins.forEach(a => {
        let btn = a.username !== 'admin' ? `<button class="btn-icon" onclick="deleteAdmin('${a.id}')"><i class="fa-solid fa-trash"></i></button>` : '';
        tbody.innerHTML += `<tr><td>${a.username}</td><td><span class="badge badge-info">${a.role}</span></td><td class="text-right">${btn}</td></tr>`;
    });
}
const adminModal = document.getElementById("admin-account-modal");
document.getElementById("btn-add-admin-modal").addEventListener("click", () => adminModal.classList.remove("hidden"));
document.getElementById("btn-close-admin-modal").addEventListener("click", () => adminModal.classList.add("hidden"));
document.getElementById("form-admin-account").addEventListener("submit", (e) => {
    e.preventDefault();
    state.admins.push({ id: "A"+Date.now(), username: document.getElementById("new-admin-user").value, password: document.getElementById("new-admin-pass").value, role: "admin" });
    saveStateToLocal(); renderAdminsTable(); adminModal.classList.add("hidden");
});
window.deleteAdmin = function(id) { if(confirm("Hapus admin ini?")) { state.admins = state.admins.filter(a => a.id !== id); saveStateToLocal(); renderAdminsTable(); } }

// ADMIN: REPORTS
function renderReports() {
    const t = document.getElementById("select-report-month"); if(!t) return;
    const m = t.value; // YYYY-MM
    const tbody = document.getElementById("report-list-body"); tbody.innerHTML = "";
    
    state.teachers.forEach(t => {
        const logs = state.attendance.filter(a => a.teacherId === t.id && a.date.startsWith(m));
        const tepat = logs.filter(l => l.type==='hadir' && l.statusIn==='Tepat Waktu').length;
        const lambat = logs.filter(l => l.type==='hadir' && l.statusIn==='Terlambat').length;
        const izin = logs.filter(l => l.type==='izin' || l.type==='sakit').length;
        const alpa = logs.filter(l => l.type==='alpa').length;
        const h = tepat+lambat;
        tbody.innerHTML += `<tr><td>${t.name}</td><td class="text-center">${h}</td><td class="text-center">${tepat}</td><td class="text-center">${lambat}</td><td class="text-center">${izin}</td><td class="text-center">${alpa}</td><td class="text-right"><span class="badge badge-success">OK</span></td></tr>`;
    });
}
if(document.getElementById("select-report-month")) {
    const sel = document.getElementById("select-report-month");
    const d = new Date(); sel.innerHTML = `<option value="${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}">Bulan Ini</option>`;
    sel.addEventListener("change", renderReports);
}


// ==========================================================================
// BOOTSTRAP
// ==========================================================================
if (!window.QRHelper) {
    qrHelper = { generateMockSVG: (text) => `<div style="text-align:center; padding:10px;"><i class="fa-solid fa-qrcode" style="font-size:64px; color:#3b82f6;"></i><br>${text}</div>` }
} else { qrHelper = new QRHelper(); }

window.addEventListener("load", () => {
    setupLocalStorage();
    checkSession();
});
