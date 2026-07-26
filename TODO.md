# TODO Progress

## ✅ Completed Features

### 1. Notifikasi Pergantian Jam Mapel (Class Change Overlay)
- [x] Modal notifikasi dengan animasi slide-in/out
- [x] Suara alarm bel sekolah (6x beep E5-B5)
- [x] Getaran (vibrate) HP
- [x] Auto-dismiss 8 detik dengan countdown
- [x] Notifikasi Desktop/OS (Notification API)
- [x] Fallback audio jika AudioContext gagal
- [x] Flag `isCCAudioPlaying` untuk mencegah overlap suara

### 2. Notifikasi WhatsApp Izin/Sakit
- [x] Kirim notifikasi WhatsApp ke Kepala Sekolah
- [x] Kirim notifikasi WhatsApp ke Guru Piket
- [x] Konfigurasi nomor di panel admin
- [x] Simpan konfigurasi di localStorage

### 3. ✨ Fitur Baru: Jam Real-Time Guru (2025-04-15)
- [x] **index.html**: Tambah elemen `#guru-datetime` di header guru (jam & tanggal real-time)
- [x] **style.css**: CSS untuk `.guru-header-right`, `.guru-datetime`, `.guru-time`, `.guru-date`
- [x] **app.js**: 
  - Fungsi `updateGuruClock()` — perbarui jam & tanggal setiap detik
  - Fungsi `stopGuruClock()` — bersihkan interval
  - Panggil di `initGuruView()` — mulai jam saat guru login
- [x] Izin notifikasi desktop diminta di awal (`requestNotificationPermission()`)

## 🔄 In Progress
- Menambahkan tombol "Refresh/Paksa Sync" di admin panel
- Menambahkan indikator koneksi Firebase di header admin

