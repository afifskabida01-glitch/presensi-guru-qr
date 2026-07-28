# ✅ DONE: Perbaikan Nomor HP (2 Guru Piket + Kepala Sekolah Fix)

## Masalah Selesai
- ✅ Notifikasi WhatsApp hanya dikirim ke 1 nomor guru piket → **Sekarang dikirim ke ARRAY `picketPhones[]`**
- ✅ Kepala Sekolah nomornya bisa ke-override oleh auto-detect → **Sekarang FIXED/READONLY dari data guru**
- ✅ UI hanya punya 1 field untuk guru piket → **Sekarang ada 2 field (Piket 1 & Piket 2)**

## Perubahan yang dilakukan

### `index.html` - UI
- ✅ 2 field input: `#notif-picket-phone-1` dan `#notif-picket-phone-2`
- ✅ Field Kepala Sekolah `#notif-headmaster-phone` dibuat `readonly disabled`
- ✅ Tombol "Refresh" untuk memperbarui nomor Kepsek dari data guru
- ✅ Informasi bahwa notifikasi dikirim ke **1 Kepsek + 2 Guru Piket**

### `app.js` - Logic
- ✅ `notifConfig.picketPhones` → **array** (bukan string)
- ✅ `findPicketPhones()` → return array of all picket teachers today (filter by `picketDay`)
- ✅ `findHeadmasterPhone()` → HANYA dari jabatan yang mengandung "Kepala Sekolah"
- ✅ `sendIzinWhatsAppNotification()` → kirim ke Kepsek + ALL picket phones (iterate with setTimeout delays)
- ✅ `autoDetectNotifNumbers()` → isi otomatis ke 2 field dari data guru
- ✅ `loadNotifConfig()` → baca simpanan + auto-detect ulang
- ✅ `saveNotifConfig()` → simpan manual khusus nomor piket
- ✅ `refreshHeadmasterPhone()` → fungsi baru untuk tombol Refresh

---

# ✅ DONE: Perbaikan PDF Export - Garis, Nama Petugas Piket, Wrap Teks, Header Kolom

## Masalah Selesai

### Issue 1: Garis ganda di baris pertama (nomor 1)
- ✅ Di `exportReportPdf()`: Garis pemisah antar baris data sekarang **skip untuk index 0** (baris pertama) agar tidak double dengan garis header tabel
- ✅ Di `exportIzinSakitPdf()`: Sama, skip garis untuk index 0

### Issue 2: Nama Petugas Piket tidak otomatis untuk laporan bulan lalu
- ✅ `findPicketName(dateStr)` — sekarang menerima parameter tanggal, bukan hardcode `new Date()` (hari ini)
- ✅ `drawPdfFooter(doc, ..., reportDateStr)` — menerima tanggal laporan dan meneruskannya ke `findPicketName()`
- ✅ `exportReportPdf()` — mengirim `m + '-01'` (tanggal pertama bulan) ke `drawPdfFooter()`
- ✅ `exportIzinSakitPdf()` — mengirim `m + '-01'` (tanggal pertama bulan) ke `drawPdfFooter()`

### Issue 3: Teks Keterangan tidak wrap di `exportIzinSakitPdf()`
- ✅ Menggunakan `doc.splitTextToSize()` untuk wrap teks keterangan
- ✅ Menghitung baris tambahan (`extraLines`) dan menambah tinggi baris sesuai jumlah baris keterangan

### Issue 4: Header kolom "Izin/ Sk"
- ✅ Diubah menjadi "Izin" (sesuai data yang ditampilkan: jumlah izin/sakit, bukan "Izin/Skor")

## Perubahan di `app.js`

### `findPicketName(dateStr)`
- **Before:** `getDayName(new Date())` — selalu hari ini
- **After:** `getDayName(targetDate)` — berdasarkan parameter `dateStr`, fallback ke hari ini jika tidak ada

### `drawPdfFooter(doc, pageWidth, marginLeft, marginRight, y, reportDateStr)`
- **Before:** Tidak ada parameter `reportDateStr`
- **After:** Menerima `reportDateStr` dan meneruskannya ke `findPicketName()`

### `exportReportPdf()` — data loop
- **Before:** Garis untuk semua baris termasuk index 0
- **After:** `if (index > 0) { doc.line(...) }` — skip baris pertama

### `exportIzinSakitPdf()` — data loop
- **Before:** `doc.text(log.keterangan || '-', ...)` langsung tanpa wrap
- **After:** `doc.splitTextToSize()` + hitung `extraLines` + `if (index > 0)` untuk garis pemisah

---

# DONE: Revisi Format Export PDF Presensi

## Hasil akhir
- Watermark PDF memakai `logo.png` dengan transparansi ringan.
- Judul laporan menjadi **LAPORAN PRESENSI GURU DIGITAL** dan periode menggunakan format `YYYY-MM`.
- Tabel ringkasan mengikuti acuan: **No, Nama Guru, Hadir, Poin, Catatan Terakhir**.
- Garis luar, garis kolom, dan garis setiap baris tabel ditambahkan agar rapi dan mudah dibaca.
- Keterangan penilaian menampilkan poin Tepat Waktu, Izin/Sakit, Terlambat, dan Alpa.
- Area TTD hanya memuat **Kepala Sekolah** dan **Kepala Tata Usaha**.
- Nama kedua penandatangan terisi otomatis dari data guru berdasarkan jabatan yang mengandung `Kepala Sekolah` dan `Tata Usaha`.

## Dampak
- Tampilan halaman aplikasi, data presensi, CSV, dan laporan di dashboard tidak diubah.
- Template TTD dua pihak juga dipakai oleh Export PDF Izin/Sakit karena keduanya menggunakan fungsi footer PDF yang sama.

---

# DONE: Piket Setiap Hari, Alpa Otomatis, dan PDF Izin/Sakit

- Opsi `Setiap Hari` ditambahkan pada Hari Piket guru.
- Guru piket yang belum mempunyai presensi pada hari sebelumnya otomatis dicatat sebagai `Alpa` ketika aplikasi tersinkron.
- Log alpa otomatis hanya dibuat untuk guru yang memang terjadwal piket dan tidak menimpa presensi yang sudah ada.
- PDF Izin/Sakit memakai grid tabel penuh, tinggi baris dinamis, serta keterangan yang dibatasi maksimal tiga baris agar tetap berada di dalam sel.
- TTD PDF Izin/Sakit otomatis memuat dua guru piket berdasarkan hari dari data izin/sakit yang dicetak.


---

# ✅ DONE: Bug Fix - Field Password Admin & GState Watermark

## Bug 1: Field Password Hilang di Modal Tambah Admin

**Masalah:** Modal "Tambah Admin" di index.html hanya memiliki field username, tetapi handler submit di app.js membaca document.getElementById("new-admin-pass").value yang menyebabkan TypeError (null).

**Perbaikan:** Ditambahkan field password di modal admin.

### File diubah
- index.html — Field password ditambahkan di dmin-account-modal

---

## Bug 2: Runtime Error doc.GState di drawWatermark

**Masalah:** doc.setGState(new doc.GState({...})) menyebabkan TypeError karena doc.GState tidak tersedia di jsPDF UMD.

**Perbaikan:** Menggunakan class reference dari jsPDF.GState atau window.jspdf.jsPDF.GState dengan fallback.

### File diubah
- pp.js — Fungsi drawWatermark() diperbaiki dengan fallback jika GState tidak tersedia
