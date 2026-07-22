# TODO - Perubahan Sistem Presensi Guru (SELESAI)

## Ringkasan Perubahan

### 1. Hari Minggu pada data guru
- [x] Dropdown "Hari Piket" di modal tambah/edit guru: sudah ada opsi **Minggu**.
- [x] Grid jadwal (admin) menggunakan array `["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]`.
- [x] `getDayName()` di `app.js` sudah mengembalikan "Minggu" untuk day index 0.
- [x] `getAcuanHadir()` memeriksa `teacher.picketDay === dayName` dan `schedule.day` → Minggu sudah support.

### 2. Fungsikan waktu terlewat = terlambat
- [x] `determineStatusIn(timeScanned, acuanJam)`: jika `timeScanned > acuanJam` => "Terlambat". Logika ini sudah benar untuk semua hari termasuk Minggu.
- [x] `processAttendance()` memanggil `getAcuanHadir()` yang mengambil jam pertama dari jadwal/piket guru pada hari Minggu jika ada.
- [x] Jika tidak ada jadwal/piket → `wajibHadir: false` → status default "Tepat Waktu" (tidak dianggap terlambat).

### 3. Bagian dashboard admin & guru (Wajib Hadir)
- [x] Fitur "Waktu Wajib Hadir default" telah dihapus berdasarkan feedback.
- [x] Acuan jam wajib hadir berasal dari **jadwal mapel entry pertama** atau **jam piket guru**.
- [x] Jika tidak ada jadwal/piket → status "Tidak Wajib Hadir".
- [x] Hanya admin yang bisa mengatur jadwal/piket guru (CRUD jadwal mapel, piket).

### 4. Status "Tidak Wajib" vs "Belum Hadir" / "Terlambat"
- [x] Jika teacher tanpa jadwal/piket pada hari tertentu → `wajibHadir: false` → tampil badge "Tidak Wajib" di tabel kehadiran admin.
- [x] Jika teacher punya jadwal/piket → `wajibHadir: true` → jika belum absen tampil "Belum Hadir" (merah).
- [x] Jika sudah absen, status sesuai `statusIn` (Tepat Waktu / Terlambat).

## File yang diubah
1. `index.html` - Dropdown hari piket ditambah opsi Minggu; UI "Waktu Wajib Hadir" di admin & guru dihapus.
2. `app.js` - Minggu pada grid jadwal; semua fungsi settings/wajib hadir default dihapus.
