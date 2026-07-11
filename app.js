/**
 * QRPresensi - Application Logic (Vanilla JS with Firebase Firestore Integration)
 * Mengelola state guru, pengaturan jadwal, riwayat presensi harian, dan simulator mobile.
 * Mendukung penyimpanan lokal (LocalStorage) dan sinkronisasi Cloud waktu nyata (Firebase).
 */

// ==========================================================================
// STATE MANAGEMENT & DATA DEFAULT
// ==========================================================================

const DEFAULT_TEACHERS = [
    { id: "t1", name: "Budi Santoso, S.Pd.", nip: "198203112009041003", checkIn: "07:00", picket: "Senin" },
    { id: "t2", name: "Rina Wijaya, M.Pd.", nip: "198705142014022001", checkIn: "07:00", picket: "Selasa" },
    { id: "t3", name: "Ahmad Fauzi, S.T.", nip: "198008232006041002", checkIn: "07:30", picket: "Rabu" },
    { id: "t4", name: "Siti Aminah, S.Ag.", nip: "197509121998032004", checkIn: "07:00", picket: "Kamis" },
    { id: "t5", name: "Diana Lestari, S.Psi.", nip: "199112092019032015", checkIn: "07:15", picket: "Jumat" }
];

// Generator riwayat log presensi historis untuk demo dashboard agar terlihat penuh (Juli 1 - Juli 10, 2026)
function generateHistoricalLogs() {
    const logs = [];
    const dates = [
        "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-06", 
        "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"
    ]; // Melewatkan sabtu/minggu

    dates.forEach(date => {
        DEFAULT_TEACHERS.forEach((teacher, idx) => {
            let checkInTime;
            let checkHour = parseInt(teacher.checkIn.split(":")[0]);
            let checkMin = parseInt(teacher.checkIn.split(":")[1]);
            
            const rand = Math.random();
            if (rand < 0.15) {
                checkMin += Math.floor(Math.random() * 20) + 16; // Terlambat
            } else {
                checkMin += Math.floor(Math.random() * 14) - 5; // Tepat waktu
            }

            if (checkMin >= 60) {
                checkHour += 1;
                checkMin -= 60;
            } else if (checkMin < 0) {
                checkMin += 60;
                checkHour -= 1;
            }

            const formattedTime = `${String(checkHour).padStart(2, '0')}:${String(checkMin).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
            
            const checkInLimit = new Date(`${date}T${teacher.checkIn}`);
            const checkInActual = new Date(`${date}T${formattedTime}`);
            const diffMin = (checkInActual - checkInLimit) / (1000 * 60);
            const status = diffMin > 15 ? "Terlambat" : "Tepat Waktu";

            logs.push({
                id: `l-${date}-${teacher.id}`,
                teacherId: teacher.id,
                teacherName: teacher.name,
                teacherNip: teacher.nip,
                date: date,
                time: formattedTime,
                status: status
            });
        });
    });

    return logs;
}

let state = {
    teachers: DEFAULT_TEACHERS,
    attendance: [],
    settings: {
        defaultCheckIn: "07:00",
        toleranceMinutes: 15,
        picketDays: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    },
    activeToken: ""
};

// Database state variable
let db = null;
let isFirebaseActive = false;

// Inisialisasi Database (Firebase vs LocalStorage)
async function initDatabase() {
    const indicatorText = document.getElementById("storage-mode-text");
    const indicatorBox = document.getElementById("storage-mode-indicator");

    // Deteksi apakah konfigurasi Firebase valid dan bukan placeholder
    if (window.firebaseConfig && 
        window.firebaseConfig.apiKey && 
        window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
        
        try {
            firebase.initializeApp(window.firebaseConfig);
            db = firebase.firestore();
            isFirebaseActive = true;
            console.log("Firebase Firestore initialized successfully.");

            if (indicatorText && indicatorBox) {
                indicatorText.textContent = "Mode: Cloud (Firebase)";
                indicatorBox.classList.add("cloud");
            }

            // Benahi data awal di Firestore jika masih kosong (seeding)
            await seedFirestoreIfEmpty();
            
            // Dengarkan perubahan data Firestore secara realtime
            initFirebaseListeners();

        } catch (e) {
            console.error("Gagal inisialisasi Firebase. Beralih ke LocalStorage fallback.", e);
            setupLocalStorageFallback();
        }
    } else {
        console.log("Menggunakan penyimpanan lokal browser (LocalStorage).");
        setupLocalStorageFallback();
    }
}

// Fallback jika Firebase tidak aktif
function setupLocalStorageFallback() {
    state.teachers = JSON.parse(localStorage.getItem('qr_presensi_teachers')) || DEFAULT_TEACHERS;
    state.attendance = JSON.parse(localStorage.getItem('qr_presensi_attendance')) || generateHistoricalLogs();
    state.settings = JSON.parse(localStorage.getItem('qr_presensi_settings')) || {
        defaultCheckIn: "07:00",
        toleranceMinutes: 15,
        picketDays: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]
    };
    
    const indicatorText = document.getElementById("storage-mode-text");
    const indicatorBox = document.getElementById("storage-mode-indicator");
    if (indicatorText && indicatorBox) {
        indicatorText.textContent = "Mode: Lokal (Demo)";
        indicatorBox.classList.remove("cloud");
    }

    // Render UI secara konvensional
    renderDashboardStats();
    renderLiveFeed();
    renderTeachersTable();
    populateSimulatorTeacherDropdown();
    updateSimulatorTeacherProfile();
    renderReports();
}

// Menyimpan ke LocalStorage (hanya digunakan pada mode fallback)
function saveStateToLocal() {
    if (!isFirebaseActive) {
        localStorage.setItem('qr_presensi_teachers', JSON.stringify(state.teachers));
        localStorage.setItem('qr_presensi_attendance', JSON.stringify(state.attendance));
        localStorage.setItem('qr_presensi_settings', JSON.stringify(state.settings));
    }
}

// ==========================================================================
// DATABASE FIREBASE ACTIONS (REAL-TIME READ/WRITE)
// ==========================================================================

async function seedFirestoreIfEmpty() {
    try {
        const teachersSnapshot = await db.collection("teachers").limit(1).get();
        if (teachersSnapshot.empty) {
            console.log("Seeding data guru default ke Firestore...");
            const batch = db.batch();
            DEFAULT_TEACHERS.forEach(t => {
                const docRef = db.collection("teachers").doc(t.id);
                batch.set(docRef, t);
            });
            await batch.commit();
        }

        const settingsSnapshot = await db.collection("settings").doc("global").get();
        if (!settingsSnapshot.exists) {
            console.log("Seeding pengaturan default ke Firestore...");
            await db.collection("settings").doc("global").set(state.settings);
        }

        const attendanceSnapshot = await db.collection("attendance").limit(1).get();
        if (attendanceSnapshot.empty) {
            console.log("Seeding riwayat kehadiran default ke Firestore...");
            const mockLogs = generateHistoricalLogs();
            const batch = db.batch();
            mockLogs.forEach(log => {
                const docRef = db.collection("attendance").doc(log.id);
                batch.set(docRef, log);
            });
            await batch.commit();
        }
    } catch (e) {
        console.error("Error seeding Firestore data:", e);
    }
}

function initFirebaseListeners() {
    // 1. Listeners Data Guru
    db.collection("teachers").onSnapshot(snapshot => {
        const list = [];
        snapshot.forEach(doc => {
            list.push(doc.data());
        });
        state.teachers = list;
        
        renderTeachersTable();
        populateSimulatorTeacherDropdown();
        updateSimulatorTeacherProfile();
        renderReports();
    }, err => console.error("Error realtime teachers:", err));

    // 2. Listeners Data Pengaturan
    db.collection("settings").doc("global").onSnapshot(doc => {
        if (doc.exists) {
            state.settings = doc.data();
            
            // Perbarui form jika user sedang berada di tab pengaturan
            const inputCheckin = document.getElementById("set-default-checkin");
            const inputTolerance = document.getElementById("set-tolerance-minutes");
            if (inputCheckin) inputCheckin.value = state.settings.defaultCheckIn;
            if (inputTolerance) inputTolerance.value = state.settings.toleranceMinutes;
            
            document.querySelectorAll("input[name='active-days']").forEach(cb => {
                cb.checked = state.settings.picketDays.includes(cb.value);
            });

            updateSimulatorTeacherProfile();
        }
    }, err => console.error("Error realtime settings:", err));

    // 3. Listeners Data Presensi
    db.collection("attendance").onSnapshot(snapshot => {
        const list = [];
        snapshot.forEach(doc => {
            list.push(doc.data());
        });
        state.attendance = list;
        
        renderDashboardStats();
        renderLiveFeed();
        updateSimulatorTeacherProfile();
        renderReports();
    }, err => console.error("Error realtime attendance:", err));
}

// CRUD Wrappers
async function saveTeacher(teacher) {
    if (isFirebaseActive) {
        await db.collection("teachers").doc(teacher.id).set(teacher);
    } else {
        const index = state.teachers.findIndex(t => t.id === teacher.id);
        if (index !== -1) {
            state.teachers[index] = teacher;
        } else {
            state.teachers.push(teacher);
        }
        saveStateToLocal();
        renderTeachersTable();
        populateSimulatorTeacherDropdown();
        updateSimulatorTeacherProfile();
        renderReports();
    }
}

async function deleteTeacherFromDb(id) {
    if (isFirebaseActive) {
        await db.collection("teachers").doc(id).delete();
    } else {
        state.teachers = state.teachers.filter(t => t.id !== id);
        saveStateToLocal();
        renderTeachersTable();
        populateSimulatorTeacherDropdown();
        updateSimulatorTeacherProfile();
        renderReports();
    }
}

async function saveSettings(settings) {
    if (isFirebaseActive) {
        await db.collection("settings").doc("global").set(settings);
    } else {
        state.settings = settings;
        saveStateToLocal();
        updateSimulatorTeacherProfile();
        alert("Konfigurasi global berhasil disimpan secara lokal!");
    }
}

async function addAttendanceLog(log) {
    if (isFirebaseActive) {
        await db.collection("attendance").doc(log.id).set(log);
    } else {
        state.attendance.push(log);
        saveStateToLocal();
        renderDashboardStats();
        renderLiveFeed();
        updateSimulatorTeacherProfile();
        renderReports();
    }
}

// ==========================================================================
// KRONOLOGI WAKTU & TOKEN HARI INI
// ==========================================================================

function updateClock() {
    const now = new Date();
    const formatTime = String(now.getHours()).padStart(2, '0') + ":" + 
                       String(now.getMinutes()).padStart(2, '0') + ":" + 
                       String(now.getSeconds()).padStart(2, '0');
    
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    const dayName = days[now.getDay()];
    const dateNum = now.getDate();
    const monthName = months[now.getMonth()];
    const yearNum = now.getFullYear();
    
    const formatDate = `${dayName}, ${dateNum} ${monthName} ${yearNum}`;

    const liveTimeEl = document.getElementById("live-time");
    const liveDateEl = document.getElementById("live-date");
    const phoneTimeEl = document.getElementById("phone-time");

    if (liveTimeEl) liveTimeEl.textContent = formatTime;
    if (liveDateEl) liveDateEl.textContent = formatDate;
    if (phoneTimeEl) phoneTimeEl.textContent = formatTime.substring(0, 5);
}

function generateNewToken() {
    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let suffix = "";
    for (let i = 0; i < 3; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    state.activeToken = `QR-${dateStr}-${suffix}`;
    
    const tokenEl = document.getElementById("active-token");
    if (tokenEl) tokenEl.textContent = state.activeToken;
    
    const qrDisplay = document.getElementById("qr-code-display");
    if (qrDisplay) {
        qrDisplay.innerHTML = QRHelper.generateSVG(state.activeToken);
    }
}

// ==========================================================================
// TAMPILAN TAB ADMIN
// ==========================================================================

function initTabNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const tabContents = document.querySelectorAll(".tab-content");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTab = item.getAttribute("data-tab");
            
            navItems.forEach(nav => nav.classList.remove("active"));
            tabContents.forEach(tab => tab.classList.remove("active"));
            
            item.classList.add("active");
            document.getElementById(`tab-${targetTab}`).classList.add("active");
            
            // Triggers render data on tab switch
            if (targetTab === "teachers") {
                renderTeachersTable();
            } else if (targetTab === "reports") {
                renderReports();
            } else if (targetTab === "dashboard") {
                renderDashboardStats();
                renderLiveFeed();
            }
        });
    });
}

// ==========================================================================
// TAB 1: RENDER DASHBOARD
// ==========================================================================

function getTodayString() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
}

function getTodayAttendance() {
    const todayStr = getTodayString();
    return state.attendance.filter(log => log.date === todayStr);
}

function renderDashboardStats() {
    const totalTeachers = state.teachers.length;
    const todayLogs = getTodayAttendance();
    const presentCount = todayLogs.length;
    const lateCount = todayLogs.filter(log => log.status === "Terlambat").length;
    const attendancePct = totalTeachers > 0 ? Math.round((presentCount / totalTeachers) * 100) : 0;

    document.getElementById("stat-total-teachers").textContent = totalTeachers;
    document.getElementById("stat-present-teachers").textContent = presentCount;
    document.getElementById("stat-late-teachers").textContent = lateCount;
    document.getElementById("stat-pct-attendance").textContent = `${attendancePct}%`;
}

function renderLiveFeed() {
    const feedList = document.getElementById("feed-scans-list");
    if (!feedList) return;

    const todayLogs = getTodayAttendance().sort((a, b) => b.time.localeCompare(a.time));

    if (todayLogs.length === 0) {
        feedList.innerHTML = `
            <div class="feed-empty">
                <i class="fa-solid fa-clipboard-question"></i>
                <p>Belum ada presensi yang tercatat hari ini.</p>
            </div>
        `;
        return;
    }

    feedList.innerHTML = todayLogs.map(log => {
        const initials = log.teacherName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
        const badgeClass = log.status === "Terlambat" ? "badge-warning" : "badge-success";
        const avatarClass = log.status === "Terlambat" ? "feed-avatar late" : "feed-avatar";
        
        return `
            <div class="feed-item" data-id="${log.id}">
                <div class="feed-teacher-info">
                    <div class="${avatarClass}">${initials}</div>
                    <div class="feed-name-nip">
                        <h5>${log.teacherName}</h5>
                        <p>NIP: ${log.teacherNip}</p>
                    </div>
                </div>
                <div class="feed-time-status">
                    <span class="feed-time">${log.time}</span>
                    <span class="badge ${badgeClass}">${log.status}</span>
                </div>
            </div>
        `;
    }).join("");
}

// ==========================================================================
// TAB 2: MANAJEMEN DATA GURU (CRUD)
// ==========================================================================

let searchFilter = "";
let dayFilter = "";

function renderTeachersTable() {
    const listBody = document.getElementById("teachers-list-body");
    if (!listBody) return;

    let filteredTeachers = state.teachers.filter(teacher => {
        const matchesSearch = teacher.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
                              teacher.nip.includes(searchFilter);
        const matchesDay = dayFilter === "" || teacher.picket === dayFilter;
        return matchesSearch && matchesDay;
    });

    if (filteredTeachers.length === 0) {
        listBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted);">
                    Tidak ada data guru yang cocok dengan pencarian / filter.
                </td>
            </tr>
        `;
        return;
    }

    listBody.innerHTML = filteredTeachers.map(teacher => {
        const initials = teacher.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
        return `
            <tr data-id="${teacher.id}">
                <td>
                    <div class="table-avatar-circle">${initials}</div>
                </td>
                <td><span class="teacher-name-cell">${teacher.name}</span></td>
                <td><span class="nip-cell">${teacher.nip}</span></td>
                <td><span class="badge badge-success" style="background: rgba(59, 130, 246, 0.1); color: var(--color-primary); border-color: rgba(59,130,246,0.2);">${teacher.picket}</span></td>
                <td><strong>${teacher.checkIn}</strong></td>
                <td class="text-right">
                    <div class="actions-cell">
                        <button class="btn-icon edit" onclick="openEditTeacher('${teacher.id}')" title="Edit Guru">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="btn-icon delete" onclick="deleteTeacher('${teacher.id}')" title="Hapus Guru">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// Handlers pencarian & filter
const searchInput = document.getElementById("search-teacher");
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        searchFilter = e.target.value;
        renderTeachersTable();
    });
}

const picketFilter = document.getElementById("filter-picket-day");
if (picketFilter) {
    picketFilter.addEventListener("change", (e) => {
        dayFilter = e.target.value;
        renderTeachersTable();
    });
}

// Modal Form Operations
const teacherModal = document.getElementById("teacher-modal");
const formTeacher = document.getElementById("form-teacher");
const modalTitle = document.getElementById("modal-title");

const addTeacherBtn = document.getElementById("btn-add-teacher-modal");
if (addTeacherBtn) {
    addTeacherBtn.addEventListener("click", () => {
        modalTitle.textContent = "Tambah Data Guru Baru";
        formTeacher.reset();
        document.getElementById("teacher-id").value = "";
        document.getElementById("teacher-checkin").value = state.settings.defaultCheckIn;
        teacherModal.classList.remove("hidden");
    });
}

const closeModalBtn = document.getElementById("btn-close-teacher-modal");
if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
        teacherModal.classList.add("hidden");
    });
}

const cancelModalBtn = document.getElementById("btn-cancel-teacher");
if (cancelModalBtn) {
    cancelModalBtn.addEventListener("click", () => {
        teacherModal.classList.add("hidden");
    });
}

if (formTeacher) {
    formTeacher.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("teacher-id").value;
        const name = document.getElementById("teacher-name").value;
        const nip = document.getElementById("teacher-nip").value;
        const checkIn = document.getElementById("teacher-checkin").value;
        const picket = document.getElementById("teacher-picket").value;

        const teacherData = {
            id: id || "t" + (new Date().getTime()),
            name,
            nip,
            checkIn,
            picket
        };

        await saveTeacher(teacherData);
        teacherModal.classList.add("hidden");
    });
}

window.openEditTeacher = function(id) {
    const teacher = state.teachers.find(t => t.id === id);
    if (!teacher) return;

    modalTitle.textContent = "Edit Informasi Guru";
    document.getElementById("teacher-id").value = teacher.id;
    document.getElementById("teacher-name").value = teacher.name;
    document.getElementById("teacher-nip").value = teacher.nip;
    document.getElementById("teacher-checkin").value = teacher.checkIn;
    document.getElementById("teacher-picket").value = teacher.picket;

    teacherModal.classList.remove("hidden");
};

window.deleteTeacher = async function(id) {
    if (confirm("Apakah Anda yakin ingin menghapus data guru ini? Riwayat presensi di database tetap disimpan.")) {
        await deleteTeacherFromDb(id);
    }
};

// ==========================================================================
// TAB 3: PENGATURAN GLOBAL
// ==========================================================================

const formSettings = document.getElementById("form-global-settings");
if (formSettings) {
    formSettings.addEventListener("submit", async (e) => {
        e.preventDefault();
        const checkIn = document.getElementById("set-default-checkin").value;
        const tolerance = parseInt(document.getElementById("set-tolerance-minutes").value);
        
        const picketDays = [];
        document.querySelectorAll("input[name='active-days']:checked").forEach(cb => {
            picketDays.push(cb.value);
        });

        const newSettings = { defaultCheckIn: checkIn, toleranceMinutes: tolerance, picketDays };
        await saveSettings(newSettings);
    });
}

// ==========================================================================
// TAB 4: LAPORAN & EXPORT
// ==========================================================================

function renderReports() {
    const tbody = document.getElementById("report-list-body");
    if (!tbody) return;

    const selectMonth = document.getElementById("select-report-month").value;
    const monthlyLogs = state.attendance.filter(log => log.date.startsWith(selectMonth));

    const reportData = state.teachers.map(teacher => {
        const teacherLogs = monthlyLogs.filter(log => log.teacherId === teacher.id);
        const presentCount = teacherLogs.length;
        const lateCount = teacherLogs.filter(log => log.status === "Terlambat").length;
        const promptCount = presentCount - lateCount;
        
        // Asumsi jumlah hari sekolah aktif terlewati dalam simulasi adalah 8 hari
        const totalWorkDays = 8;
        const absentCount = Math.max(0, totalWorkDays - presentCount);
        const score = totalWorkDays > 0 ? Math.round(((promptCount * 100) + (lateCount * 50)) / totalWorkDays) : 0;

        return {
            name: teacher.name,
            nip: teacher.nip,
            present: presentCount,
            prompt: promptCount,
            late: lateCount,
            absent: absentCount,
            score: score
        };
    });

    tbody.innerHTML = reportData.map(r => `
        <tr>
            <td><strong>${r.name}</strong></td>
            <td><span class="nip-cell">${r.nip}</span></td>
            <td class="text-center font-semibold">${r.present}</td>
            <td class="text-center text-green" style="color: var(--color-success);">${r.prompt}</td>
            <td class="text-center text-warning" style="color: var(--color-warning);">${r.late}</td>
            <td class="text-center text-danger" style="color: var(--color-danger);">${r.absent}</td>
            <td class="text-right">
                <span class="badge" style="background: rgba(6, 182, 212, 0.1); color: var(--color-info); font-size: 12px; font-weight: 700; padding: 4px 10px;">
                    ${r.score}%
                </span>
            </td>
        </tr>
    `).join("");

    renderChartData(reportData);
}

function renderChartData(reportData) {
    const chartContainer = document.getElementById("tardiness-bar-chart");
    if (!chartContainer) return;

    if (reportData.length === 0) {
        chartContainer.innerHTML = `<p style="color: var(--text-muted); margin: auto;">Belum ada data untuk grafik.</p>`;
        return;
    }

    const topTeachers = reportData.slice(0, 5);

    chartContainer.innerHTML = topTeachers.map(t => {
        const presentHeight = (t.prompt / 8) * 100;
        const lateHeight = (t.late / 8) * 100;
        const nameShort = t.name.split(",")[0];

        return `
            <div class="chart-bar-wrapper">
                <div class="chart-bar-group">
                    <div class="chart-bar present" style="height: ${presentHeight}%" title="Tepat Waktu: ${t.prompt} hari"></div>
                    <div class="chart-bar late" style="height: ${lateHeight}%" title="Terlambat: ${t.late} hari"></div>
                </div>
                <span class="chart-label" title="${t.name}">${nameShort}</span>
            </div>
        `;
    }).join("");
}

// CSV Export Handler
const exportCsvBtn = document.getElementById("btn-export-csv");
if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
        const selectMonth = document.getElementById("select-report-month").value;
        const monthlyLogs = state.attendance.filter(log => log.date.startsWith(selectMonth));
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "ID Laporan,Nama Guru,NIP,Tanggal Presensi,Jam Presensi,Status Kehadiran\n";
        
        monthlyLogs.forEach(log => {
            csvContent += `"${log.id}","${log.teacherName}","${log.teacherNip}","${log.date}","${log.time}","${log.status}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Laporan_Presensi_Guru_${selectMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

// PDF Export Handler
const exportPdfBtn = document.getElementById("btn-export-pdf");
if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
        window.print();
    });
}

const monthSelect = document.getElementById("select-report-month");
if (monthSelect) {
    monthSelect.addEventListener("change", renderReports);
}

// ==========================================================================
// SIMULATOR GURU (MOBILE PANELS)
// ==========================================================================

function populateSimulatorTeacherDropdown() {
    const select = document.getElementById("select-sim-teacher");
    if (!select) return;

    select.innerHTML = state.teachers.map(t => `
        <option value="${t.id}">${t.name}</option>
    `).join("");
}

function updateSimulatorTeacherProfile() {
    const select = document.getElementById("select-sim-teacher");
    if (!select || !select.value) return;

    const teacher = state.teachers.find(t => t.id === select.value);
    if (!teacher) return;

    const initials = teacher.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
    document.getElementById("sim-teacher-initials").textContent = initials;
    document.getElementById("sim-teacher-name").textContent = teacher.name;
    document.getElementById("sim-teacher-nip").textContent = `NIP: ${teacher.nip}`;
    
    // Jadwal
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const todayIndex = new Date().getDay();
    const todayName = days[todayIndex];

    document.getElementById("sim-today-day").textContent = todayName;
    document.getElementById("sim-checkin-time").textContent = teacher.checkIn;
    
    const isPicket = teacher.picket === todayName;
    document.getElementById("sim-picket-status").textContent = isPicket ? "Ya (Piket)" : "Tidak";

    // Cek Status Kehadiran Hari ini
    const todayStr = getTodayString();
    const checkedLog = state.attendance.find(log => log.teacherId === teacher.id && log.date === todayStr);
    
    const statusBox = document.getElementById("sim-attendance-status-box");
    const statusText = document.getElementById("sim-attendance-status-text");
    const btnScan = document.getElementById("btn-trigger-scan");

    if (checkedLog) {
        statusBox.className = "attendance-status-box " + (checkedLog.status === "Terlambat" ? "late" : "present");
        statusText.innerHTML = `Sudah Presensi: <strong>${checkedLog.time.substring(0, 5)}</strong> (${checkedLog.status})`;
        statusBox.querySelector("i").className = "fa-solid fa-circle-check";
        if (btnScan) {
            btnScan.disabled = true;
            btnScan.style.opacity = "0.4";
            btnScan.style.cursor = "not-allowed";
        }
    } else {
        statusBox.className = "attendance-status-box";
        statusText.textContent = "Belum Presensi Hari Ini";
        statusBox.querySelector("i").className = "fa-solid fa-circle-question";
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.style.opacity = "1";
            btnScan.style.cursor = "pointer";
        }
    }

    renderSimulatorPersonalLogs(teacher.id);
}

function renderSimulatorPersonalLogs(teacherId) {
    const list = document.getElementById("sim-personal-logs");
    if (!list) return;

    const teacherLogs = state.attendance
        .filter(log => log.teacherId === teacherId)
        .sort((a, b) => b.date.localeCompare(a.date));

    if (teacherLogs.length === 0) {
        list.innerHTML = `<p style="font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 10px;">Belum ada riwayat.</p>`;
        return;
    }

    list.innerHTML = teacherLogs.map(log => {
        const badgeColor = log.status === "Terlambat" ? "var(--color-warning)" : "var(--color-success)";
        return `
            <div class="personal-log-item">
                <div class="log-date-time">
                    <span class="log-date">${log.date}</span>
                    <span class="log-time">Jam: ${log.time}</span>
                </div>
                <strong style="color: ${badgeColor}">${log.status}</strong>
            </div>
        `;
    }).join("");
}

// Dropdown handler
const simTeacherSelect = document.getElementById("select-sim-teacher");
if (simTeacherSelect) {
    simTeacherSelect.addEventListener("change", updateSimulatorTeacherProfile);
}

// Scanner View Overlay
const scannerOverlay = document.getElementById("scanner-view-overlay");
const btnTriggerScan = document.getElementById("btn-trigger-scan");
const btnCloseScanner = document.getElementById("btn-close-scanner");

if (btnTriggerScan) {
    btnTriggerScan.addEventListener("click", () => {
        if (btnTriggerScan.disabled) return;
        scannerOverlay.classList.remove("hidden");
        
        // Simulasi scan 2.2 detik
        setTimeout(() => {
            performSuccessfulScan();
        }, 2200);
    });
}

if (btnCloseScanner) {
    btnCloseScanner.addEventListener("click", () => {
        scannerOverlay.classList.add("hidden");
    });
}

// Dialog Sukses
const successDialog = document.getElementById("success-dialog");
const btnCloseSuccess = document.getElementById("btn-close-success");

async function performSuccessfulScan() {
    scannerOverlay.classList.add("hidden");
    
    const select = document.getElementById("select-sim-teacher");
    const teacher = state.teachers.find(t => t.id === select.value);
    if (!teacher) return;

    const now = new Date();
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hour}:${min}:${sec}`;
    const dateStr = getTodayString();

    const checkInLimit = new Date(`${dateStr}T${teacher.checkIn}`);
    const checkInActual = new Date(`${dateStr}T${timeStr}`);
    const diffMin = (checkInActual - checkInLimit) / (1000 * 60);
    const status = diffMin > state.settings.toleranceMinutes ? "Terlambat" : "Tepat Waktu";

    const newLog = {
        id: `l-${dateStr}-${teacher.id}-${now.getTime()}`,
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherNip: teacher.nip,
        date: dateStr,
        time: timeStr,
        status: status
    };

    // Tulis ke Database (Cloud Firebase / Local)
    await addAttendanceLog(newLog);

    // Tampilkan notifikasi modal sukses
    document.getElementById("success-time").textContent = timeStr;
    const badge = document.getElementById("success-status-badge");
    badge.textContent = status;
    
    if (status === "Terlambat") {
        badge.className = "badge badge-warning";
        document.getElementById("success-message").textContent = `Presensi Anda dicatat. Namun Anda terlambat ${Math.round(diffMin)} menit dari jam masuk yang dijadwalkan (${teacher.checkIn}).`;
    } else {
        badge.className = "badge badge-success";
        document.getElementById("success-message").textContent = `Selamat, Anda berhasil mencatat kehadiran tepat waktu untuk hari ini!`;
    }

    successDialog.classList.remove("hidden");
}

if (btnCloseSuccess) {
    btnCloseSuccess.addEventListener("click", () => {
        successDialog.classList.add("hidden");
    });
}

// ==========================================================================
// INISIALISASI APLIKASI
// ==========================================================================

window.addEventListener("DOMContentLoaded", async () => {
    // 1. Jalankan Jam dinamis
    updateClock();
    setInterval(updateClock, 1000);

    // 2. Generate token QR Code harian pertama
    generateNewToken();
    const btnRegenQr = document.getElementById("btn-regenerate-qr");
    if (btnRegenQr) {
        btnRegenQr.addEventListener("click", () => {
            generateNewToken();
            const display = document.getElementById("qr-code-display");
            display.classList.add("fadeIn");
            setTimeout(() => display.classList.remove("fadeIn"), 300);
        });
    }

    // 3. Tab Navigasi Admin
    initTabNavigation();

    // 4. Inisialisasi Database (Firebase vs Local)
    await initDatabase();
});
