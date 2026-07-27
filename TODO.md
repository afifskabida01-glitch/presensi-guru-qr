# ✅ TODO: Perbaikan Notifikasi Pergantian Jam Pelajaran — SELESAI

## Masalah
Notifikasi pergantian jam pelajaran tidak muncul saat Chrome di-minimize / background karena:
1. `setInterval` di-throttle Chrome sampai ~1 menit
2. `AudioContext` di-suspend Chrome
3. Izin notifikasi diminta di load, bukan di interaksi pengguna
4. Tidak ada mekanisme catch-up saat tab kembali aktif

## Steps

### ✅ Step 1: Izin Notifikasi Berbasis Interaksi
- Pindahkan `requestNotificationPermission()` dari `window.load` ke event click login guru & trigger scan
- [x] Dipanggil di `btn-login-guru` click handler
- [x] Dipanggil di `btn-trigger-scan` click handler

### ✅ Step 2: Page Visibility API + Catch-up Notifikasi
- Tambahkan event listener `visibilitychange` di `document`
- [x] Resume AudioContext saat tab aktif kembali
- [x] Panggil `tickRundownClassNotify()` segera saat tab aktif
- [x] Reset `lastRundownClassKey` supaya notifikasi bisa muncul lagi

### ✅ Step 3: Hybrid Interval yang Lebih Resilien
- [x] Kurangi interval dari 10s jadi 5s
- [x] Pengecekan ganda saat tab aktif kembali

### ✅ Step 4: Auto-resume AudioContext
- [x] Resume otomatis saat visibility change
- [x] Resume juga sebelum play sound jika state 'suspended'
- [x] Event listener `click`, `touchstart`, `keydown` untuk resume AudioContext

### ✅ Step 5: Service Worker untuk Notifikasi Background
- [x] Buat file `sw.js` dengan caching, push notification handler, notification click handler
- [x] Daftarkan service worker di `index.html`
- [x] Offline cache support

### ✅ Step 6: [BARU] Ganti Rundown Jadwal dari PDF ke PNG
- [x] Ubah `iframe` (PDF) menjadi `<img>` (PNG) di `index.html`
- [x] Tambahkan zoom in/out functionality via JS
- [x] Tambahkan touch/drag pan & pinch zoom
- [x] Tambahkan fallback error handler jika gambar tidak ditemukan

### ✅ Step 7: [BARU] PDF Laporan dengan Kop Surat & Watermark
- [x] Fungsi `loadPdfLogos()` untuk muat logo.png dan img_smk_bisa.png
- [x] Fungsi `drawPdfHeader()` untuk menggambar header kop surat + logo
- [x] Integrasi watermark "SMK BIDAYATUL HIDAYAH" di background PDF
- [x] Fungsi `exportIzinSakitPdf()` untuk laporan izin/sakit terpisah
- [x] Tombol "Export PDF Izin/Sakit" di tab Laporan

### ✅ Semua perubahan sudah terintegrasi dengan benar

