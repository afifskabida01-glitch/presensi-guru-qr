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

