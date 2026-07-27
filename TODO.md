# ✅ TODO: Perbaikan Nomor HP (2 Guru Piket + Kepala Sekolah Fix)

## Masalah
- Notifikasi WhatsApp hanya dikirim ke 1 nomor guru piket
- Kepala Sekolah nomornya bisa ke-override oleh auto-detect
- UI hanya punya 1 field untuk guru piket, padahal ada 2 guru piket

## Steps

### Step 1: Update `index.html` - UI untuk 2 Guru Piket
- [x] Ubah 1 field "Nomor WhatsApp Guru Piket" menjadi 2 field (Guru Piket 1 & Guru Piket 2)
- [x] Kepala Sekolah field dibuat readonly (auto dari data guru)
- [x] Tambahkan informasi bahwa notifikasi akan dikirim ke 3 nomor

### Step 2: Update `app.js` - Logic untuk 2 Piket + Kepsek Fix
- [x] `findPicketPhones()` → return array of all picket teachers today
- [x] `findHeadmasterPhone()` → hanya dari jabatan "Kepala Sekolah"
- [x] `sendIzinWhatsAppNotification()` → kirim ke kepala sekolah + SEMUA picket phones (iterate array)
- [x] `loadNotifConfig()` / `autoDetectNotifNumbers()` → isi otomatis ke 2 field piket (`picket-phone-1` & `picket-phone-2`)
- [x] `saveNotifConfig()` → simpan ke array `picketPhones` dari 2 input field manual

### Step 3: Test (manual oleh user)
- [ ] Verifikasi 2 guru piket dengan hari yang sama terdeteksi otomatis
- [ ] Verifikasi notifikasi WA terbuka ke 3 nomor (1 Kepsek + 2 Piket) saat guru lapor izin
- [ ] Verifikasi kepala sekolah readonly tidak bisa diubah manual
- [ ] Verifikasi tombol Refresh Kepsek berfungsi

