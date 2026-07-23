# TODO - Notifikasi Pergantian Jam Mapel

## Steps:

### 1. index.html
- [x] Tambahkan elemen notifikasi modal (`#class-change-notification`) dengan:
  - Icon mapel
  - Teks "Waktunya Masuk Kelas!"
  - Nama mapel, kelas, dan jam
  - Tombol tutup
  - Timer countdown untuk auto-dismiss

### 2. style.css
- [x] Tambahkan CSS untuk notifikasi modal
  - Animasi slide-in dari atas (ccSlideDown)
  - Animasi slide-out ke atas (ccSlideUp)
  - Glass effect background dengan blur
  - Animasi bel/lonceng (ccBellRing)
  - Styling tombol dismiss dengan gradien oranye

### 3. app.js
- [x] Perbarui `showClassChangeNotify()` menjadi modal yang lebih besar
- [x] Tambahkan suara beep 3x menggunakan Web Audio API (frekuensi 880Hz)
- [x] Tambahkan getaran (vibrate) untuk HP : `navigator.vibrate([200,100,200,100,200])`
- [x] Tambahkan auto-dismiss timer 8 detik
- [x] Tambahkan countdown pada notifikasi (update setiap detik)
- [x] Interval ditingkatkan dari 30 detik ke 10 detik

