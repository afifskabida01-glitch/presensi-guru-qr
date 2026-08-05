# TODO: E_PGSkabida - Sistem Presensi Guru Digital SMK Bidayatul Hidayah

Checklist keseluruhan aplikasi. Centang `[x]` jika fitur selesai, kosongkan `[ ]` jika belum.

---

## 1. Sistem Login & Autentikasi

- [x] Login Guru (dropdown pilih nama dari data guru)
- [x] Login Staff/Laporan (dropdown guru jabatan Kepala Sekolah/Tata Usaha/Bendahara)
- [x] Login Admin (username: admin, password: 123)
- [x] Tab login switching (Guru / Laporan / Admin)
- [x] Session management (sessionStorage) & auto-restore
- [x] Logout untuk semua role (Guru, Staff, Admin)
- [x] Routing view otomatis per role (login → guru/staff/admin)
- [x] Responsive layout saat resize (mobile/desktop)

## 2. Aplikasi Guru (Mobile)

- [x] Tampilan jadwal hari ini (jadwal mengajar + guru piket)
- [x] Jam & tanggal real-time (update tiap detik)
- [x] Status kehadiran hari ini (Belum Absen / Hadir / Selesai / Izin / Sakit)
- [x] Tombol scan QR Code utama (Absen Datang / Absen Pulang)
- [x] Kamera scanner QR menggunakan jsQR (live camera)
- [x] Validasi token QR (jendela 5 menit + toleransi 3 menit)
- [x] Proses absen datang (tentukan status Tepat Waktu / Terlambat)
- [x] Proses absen pulang (catat jam pulang)
- [x] Success dialog setelah absen (waktu, acuan, status)
- [x] Lapor Izin / Sakit (jenis + keterangan)
- [x] Riwayat pribadi 5 log terakhir
- [x] Lihat Rundown Jadwal (gambar PNG)
- [x] Zoom in/out rundown (tombol + pinch gesture)
- [x] Pan/geser gambar rundown (drag & touch)
- [x] Notifikasi pergantian kelas (suara alarm + getar + desktop notification)
- [x] Countdown auto-dismiss notifikasi kelas (8 detik)
- [x] Notifikasi muncul kembali saat tab aktif (Page Visibility API)
- [x] Tombol "Siap Mengajar" untuk menutup notifikasi

## 3. View Staff Laporan (Kepala Sekolah / Tata Usaha / Bendahara)

- [x] Login khusus jabatan Kepala Sekolah / Tata Usaha / Bendahara
- [x] Sidebar 2 tab: Laporan Harian & Laporan Bulanan
- [x] Laporan Harian (rekapan presensi guru per tanggal)
  - [x] Pilih tanggal (default hari ini)
  - [x] Kolom: Guru, Acuan, Jam Datang, Jam Pulang, Status, Keterangan
  - [x] Status otomatis: Belum Hadir / Tidak Wajib / Tepat Waktu / Terlambat / Izin / Sakit / Alpa
- [x] Laporan Bulanan (rekapan per bulan + skor penilaian)
  - [x] Dropdown pilih bulan (4 bulan terakhir)
  - [x] Kolom: Nama Guru, Hadir, Tepat, Lambat, Izin, Alpa, Skor & Penilaian
  - [x] Skor otomatis (Tepat=100, Izin/Sakit=80, Lambat=70, Alpa=0)
  - [x] Label penilaian (Sangat Baik/Baik/Cukup/Perlu Perbaikan)

## 4. Admin Dashboard

### 4a. Dashboard (Ringkasan)
- [x] Statistik total guru, hadir, terlambat, izin/sakit hari ini
- [x] QR Code generator (token dinamis per 5 menit)
- [x] Tombol perbarui/regenerate QR
- [x] Feed aktivitas live hari ini (datang & pulang)

### 4b. Data Guru (CRUD)
- [x] Tabel daftar guru (inisial, nama, jabatan, no HP, NIP, piket)
- [x] Tambah guru (modal form)
- [x] Edit guru
- [x] Hapus guru (juga hapus jadwal terkait)
- [x] Pencarian guru (search)
- [x] Field jabatan & no HP (untuk staff & WhatsApp)

### 4c. Jadwal Mapel (CRUD)
- [x] Pilih guru → grid jadwal mingguan (Senin–Sabtu)
- [x] Jumat otomatis libur
- [x] Tambah/edit jadwal per hari (jam mulai–selesai, mapel, kelas)
- [x] Hapus entry jadwal
- [x] Tampilan "Next class" hari ini
- [x] Tambahan otomatis Guru Piket di jadwal

### 4d. Data Kehadiran (CRUD)
- [x] Tabel kehadiran per tanggal (default hari ini)
- [x] Tambah manual kehadiran
- [x] Edit kehadiran (jam datang, jam pulang, status)
- [x] Hapus kehadiran
- [x] Status otomatis sama seperti staff

### 4e. Kelola Admin
- [x] Tabel daftar admin (username, role)
- [x] Tambah admin (username & password)
- [x] Hapus admin (kecuali admin utama)

### 4f. Pengaturan & Sistem
- [x] Lihat Jadwal Pelajaran (PNG + zoom/pan/pinch)
- [x] Pengaturan Notifikasi WhatsApp Izin/Sakit
  - [x] Nomor Kepala Sekolah (otomatis dari data guru, readonly)
  - [x] Tombol refresh nomor Kepala Sekolah
  - [x] Nomor Guru Piket 1 & 2 (manual, format internasional)
  - [x] Simpan konfigurasi
- [x] Hapus semua data sistem (reset database)

### 4g. Laporan Ekspor
- [x] Laporan bulanan (tabel + skor)
- [x] Export CSV
- [x] Export PDF Presensi (kop surat, watermark logo, tanda tangan otomatis)
- [x] Export PDF Izin / Sakit (kop surat, watermark, tanda tangan)
- [x] Nama otomatis di tanda tangan (Kepala Sekolah, TU, Guru Piket)
- [x] Sanitasi teks PDF (hindari emoji/mojibake)

## 5. Notifikasi WhatsApp Izin/Sakit

- [x] Auto-detect nomor Kepala Sekolah dari data guru (jabatan)
- [x] Auto-detect nomor Guru Piket hari ini
- [x] Format nomor lokal (08xx) → internasional (628xx)
- [x] Kirim notifikasi via wa.me ke Kepala Sekolah + Guru Piket
- [x] Pesan terformat (jenis, guru, tanggal, jam, alasan)
- [x] Jeda antar kirim (hindari block popup)

## 6. Sinkronisasi Data & Firebase

- [x] Inisialisasi Firebase Firestore (jika konfigurasi ada)
- [x] Real-time listener (admins, teachers, schedules, attendance)
- [x] Fallback ke localStorage jika Firebase tidak aktif
- [x] Auto-clear storage saat versi aplikasi berubah
- [x] Auto alpa guru piket (3 hari terakhir tanpa presensi)
- [x] Prevent double-run auto alpa (flag)

## 7. PWA & Offline

- [x] Manifest PWA (nama, ikon, theme, standalone)
- [x] Service Worker (cache assets untuk offline)
- [x] Network-first strategy untuk file utama (script/style/image)
- [x] Cache fallback untuk akses offline
- [x] Skip waiting & auto-reload saat SW update
- [x] Push notification handler (future-ready)
- [x] Notification click → buka/fokus aplikasi

## 8. Pengujian (Belum Selesai)

- [ ] Test login sebagai Kepala Sekolah / Tata Usaha / Bendahara
- [ ] Test scan QR di perangkat nyata (HP Android/iPhone)
- [ ] Test absen datang & pulang dengan QR
- [ ] Test lapor izin/sakit & notifikasi WhatsApp
- [ ] Test notifikasi pergantian kelas (suara, getar, desktop)
- [ ] Test ekspor PDF (presensi & izin/sakit) - cek kop, watermark, tanda tangan
- [ ] Test ekspor CSV
- [ ] Test sinkronisasi Firebase real-time antar perangkat
- [ ] Test mode offline (tanpa internet)
- [ ] Test PWA install & akses offline
- [ ] Test auto-alpa guru piket (3 hari terakhir)
- [ ] Test responsive di berbagai ukuran layar (HP, tablet, desktop)
- [ ] Test performa & stabilitas jangka panjang (data banyak)
