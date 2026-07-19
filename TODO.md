# TODO - Perubahan Sistem Presensi Guru

- [ ] Analisis kebutuhan tambahan Minggu: tambah opsi Minggu pada dropdown hari piket guru.
- [ ] Update daftar hari pada grid jadwal (admin) agar mencakup Minggu.
- [ ] Tambah field pengaturan: "Waktu Wajib Hadir" yang hanya bisa diedit admin.
- [ ] Persist pengaturan "Waktu Wajib Hadir" ke Firebase (jika tersedia) dan/atau fallback LocalStorage.
- [ ] Tampilkan informasi "Wajib hadir pukul: HH:mm" di dashboard guru (read-only).
- [ ] Pastikan logika status terlambat menggunakan acuan yang benar pada hari Minggu.
- [ ] Testing manual: admin ubah waktu wajib hadir, guru tanpa jadwal/piket pada Minggu absen → status Tepat/Terlambat sesuai aturan.

