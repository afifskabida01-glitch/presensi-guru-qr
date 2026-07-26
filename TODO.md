# TODO: Perbaikan Notifikasi Pergantian Jam Pelajaran

## Masalah
Notifikasi pergantian jam pelajaran tidak muncul saat Chrome di-minimize / background karena:
1. `setInterval` di-throttle Chrome sampai ~1 menit
2. `AudioContext` di-suspend Chrome
3. Izin notifikasi diminta di load, bukan di interaksi pengguna
4. Tidak ada mekanisme catch-up saat tab kembali aktif

## Steps

### ✅ Step 1: Izin Notifikasi Berbasis Interaksi
- [x] Pindahkan `requestNotificationPermission()` dari `window.load` ke event click login guru & trigger scan

### ✅ Step 2: Page Visibility API + Catch-up Notifikasi
- [x] Tambahkan event listener `visibilitychange` di `document`
- [x] Resume AudioContext saat tab aktif kembali
- [x] Panggil `tickRundownClassNotify()` segera saat tab aktif
- [x] Simpan timestamp notifikasi terakhir untuk deteksi notifikasi terlewat

### ✅ Step 3: Hybrid Interval yang Lebih Resilien
- [x] Kurangi interval dari 10s jadi 5s
- [x] Tambahkan pengecekan `document.hidden` di `tickRundownClassNotify()`
- [x] Tambahkan mekanisme "catch-up" untuk notifikasi yang terlewat

### ✅ Step 4: Auto-resume AudioContext
- [x] Resume otomatis saat visibility change
- [x] Resume juga sebelum play sound jika state 'suspended'

### ✅ Step 5: Service Worker untuk Notifikasi Background
- [x] Buat file `sw.js` untuk service worker
- [x] Daftarkan service worker di `index.html`
- [x] Service worker menangani event `push` dan `notificationclick`

### ✅ Step 6: Testing & Validasi
- [x] Verifikasi semua perubahan sudah terintegrasi dengan benar

