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

# ✅ DONE: Refactor PDF Export - Gunakan `drawWatermark()`, `drawPdfHeader()`, dan `drawPdfFooter()` di `exportIzinSakitPdf()`

## Masalah Selesai
- ✅ Fungsi `exportIzinSakitPdf()` masih menggunakan teks watermark hardcoded (`"SMK BIDAYATUL HIDAYAH"` dengan font size 60) di section page break → **Sekarang menggunakan `drawWatermark()` yang sudah ada**
- ✅ Header di page break masih hardcoded (kop surat, alamat, email, garis) → **Sekarang menggunakan `drawPdfHeader()` yang sudah ada**
- ✅ Footer tanda tangan di akhir laporan masih hardcoded (cuma teks "Kepala Sekolah", "Kepala Tata Usaha", "Petugas Piket") → **Sekarang menggunakan `drawPdfFooter()` yang sudah mengambil nama otomatis dari data guru**

## Perubahan di `app.js`

### 1. Page Break (halaman baru saat data melebihi 1 halaman)
- **Before:** Teks watermark dengan `doc.setFontSize(60)` + kop surat hardcoded manual
- **After:** `drawWatermark(doc, pageWidth, pageHeight, watermarkLogo)` + `y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, y, logoLeft, logoRight)`

### 2. Footer Tanda Tangan
- **Before:** `doc.text('Kepala Sekolah', ...)` hardcoded tanpa nama
- **After:** `drawPdfFooter(doc, pageWidth, marginLeft, marginRight, y)` — otomatis mengambil nama dari data guru (Kepala Sekolah, Kepala TU, Petugas Piket)

### 3. Page Break Footer (jika footer butuh halaman baru)
- **Before:** Teks watermark hardcoded dengan `doc.setFontSize(60)`
- **After:** `drawWatermark(doc, pageWidth, pageHeight, watermarkLogo)`

