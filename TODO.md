# TODO.md - Daftar Fitur Aplikasi E_PGSkabida

## Task Sebelumnya: Tambah Password pada Masuk Laporan
Tambahkan Password pada Masuk Laporan sebelum masuk dasbor Laporan.

### Steps to Complete
- [x] 1. index.html - Tambahkan field password pada form login staff/laporan
- [x] 2. app.js - Tambahkan logika validasi password pada handler login staff
- [x] 3. app.js - Tambahkan field password pada modal Tambah/Edit Guru (untuk set password staff)
- [x] 4. Verify perubahan berfungsi dengan benar

---

## Daftar Fitur Aplikasi Lengkap
### Sistem Presensi Guru QR - SMK Bidayatul Hidayah

### 1. Sistem Login (Multi-Role)
- [x] Login sebagai Guru (pilih nama dari dropdown)
- [x] Login sebagai Laporan/Staff (Kepala Sekolah / Tata Usaha / Bendahara + password)
- [x] Login sebagai Admin (username + password)
- [x] Validasi password staff laporan
- [x] Session management (sessionStorage)

### 2. Aplikasi Guru (Mobile)
- [x] Dashboard guru dengan jam real-time & jadwal hari ini
- [x] Scan QR Code untuk Absen Datang (kamera)
- [x] Scan QR Code untuk Absen Pulang (kamera)
- [x] Validasi token QR (berlaku 5 menit dengan toleransi 3 menit)
- [x] Status indikator kehadiran (Belum Absen / Hadir / Selesai / Izin)
- [x] Lapor Izin / Sakit dengan keterangan
- [x] Riwayat presensi pribadi (5 terakhir)
- [x] Lihat Rundown Jadwal (PNG dengan zoom & pan)
- [x] Notifikasi pergantian jam pelajaran (suara + getar + notif desktop)
- [x] Success dialog setelah absen berhasil

### 3. Laporan Staff (Kepala Sekolah / TU / Bendahara)
- [x] Laporan Kehadiran Harian (per tanggal)
- [x] Laporan Kehadiran Bulanan (skor & penilaian)
- [x] Dropdown pemilihan bulan (4 bulan terakhir)

### 4. Dashboard Admin
- [x] Statistik ringkasan kehadiran hari ini (total, hadir, terlambat, izin)
- [x] QR Code generator presensi (token auto-refresh tiap 5 menit)
- [x] Feed aktivitas presensi real-time
- [x] Tombol perbarui QR Code

### 5. Manajemen Data Guru (Admin)
- [x] Tambah guru baru (nama, NIP, jabatan, no HP, password, hari & jam piket)
- [x] Edit data guru
- [x] Hapus data guru (termasuk jadwal mengajar)
- [x] Pencarian guru

### 6. Jadwal Mengajar (Admin)
- [x] Atur jadwal mengajar per guru per hari
- [x] Tambah/edit/hapus entri kelas (jam mulai, jam selesai, mapel, kelas)
- [x] Tampilan grid jadwal mingguan
- [x] Info "Next" jam pelajaran berikutnya
- [x] Jumat = libur otomatis

### 7. Data Kehadiran (Admin)
- [x] Tabel kehadiran per tanggal
- [x] Tambah presensi manual
- [x] Edit presensi (jam datang, jam pulang, status, keterangan)
- [x] Hapus presensi
- [x] Status otomatis alpa untuk guru piket yang melewati jadwal (3 hari terakhir)

### 8. Kelola Admin (Super Admin)
- [x] Tambah admin baru (username + password)
- [x] Hapus admin (kecuali admin utama)

### 9. Sistem & Cache (Admin)
- [x] Lihat Jadwal Pelajaran (PNG dengan zoom, pan, pinch)
- [x] Notifikasi WhatsApp Izin/Sakit
    - [x] Auto-detect nomor Kepala Sekolah dari data guru
    - [x] Auto-detect nomor guru piket hari ini
    - [x] Input manual nomor guru piket
    - [x] Format nomor lokal (08xx) ke internasional (628xx)
- [x] Hapus semua data sistem (reset database)

### 10. Laporan Ekspor (Admin)
- [x] Laporan bulanan (skor & penilaian)
- [x] Export CSV laporan presensi
- [x] Export PDF laporan presensi (dengan kop surat, watermark, tanda tangan otomatis)
- [x] Export PDF laporan izin/sakit
- [x] Sanitasi teks PDF (hindari karakter mojibake)
- [x] Nama tanda tangan otomatis dari data guru (Kepala Sekolah, TU, Guru Piket)

### 11. Sinkronisasi Data
- [x] Firebase Firestore real-time sync
- [x] Fallback ke LocalStorage (mode offline)
- [x] Service Worker untuk PWA (offline support)

### 12. Fitur Pendukung
- [x] Notifikasi pergantian kelas (audio beep, vibrate, desktop notification)
- [x] Page Visibility API (notifikasi muncul saat tab kembali aktif)
- [x] Responsive design (mobile & desktop)
- [x] PWA manifest (installable)
- [x] Live clock (admin & guru)
