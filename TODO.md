# TODO: Laporan Harian & Bulanan untuk Kepala Sekolah, Tata Usaha, Bendahara

## Steps
1. [x] Tambah login tab "Masuk Laporan" di index.html (dropdown guru jabatan Kepala Sekolah/Tata Usaha/Bendahara)
2. [x] Tambah markup view `view-staff` (read-only) di index.html dengan sidebar 2 tab: Laporan Harian & Laporan Bulanan
3. [x] Tambah routing & login role `staff` di app.js (checkSession, login handler)
4. [x] Tambah fungsi render `renderStaffDailyReport()` dan `renderStaffMonthlyReport()` di app.js
5. [x] Tambah trigger refresh data staff saat Firestore/localStorage berubah
6. [x] Tambah CSS untuk view staff (sidebar, tabel, layout) - reuse class admin existing
7. [x] Update versi manifest/index (cache busting)
8. [ ] Test login sebagai Kepala Sekolah/Tata Usaha/Bendahara
