# Penugasan bantuan admin di Supabase

Permintaan bantuan dari pasangan disimpan dengan `service.status = submitted` dan tanpa `assignedAdminId`. Akun admin hanya dapat melihat undangan setelah penugasan. Penugasan otomatis dengan ID admin demo hanya berlaku di mode lokal; ID tersebut bukan UUID akun Supabase.

Sampai panel penugasan operator tersedia, jalankan prosedur ini di **proyek staging** melalui SQL Editor dengan akses operator tepercaya. Checkout pada mode Supabase masih dinonaktifkan, sehingga entitlement paket bantuan untuk pengujian perlu disiapkan melalui prosedur staging terpisah.

1. Buat akun Auth untuk petugas, lalu pastikan baris `public.profiles` miliknya berperan `admin`. Catat UUID akun tersebut.
2. Temukan permintaan yang belum ditugaskan:

   ```sql
   select d.invitation_id, i.slug, d.version,
          d.state #>> '{service,status}' as service_status
   from public.invitation_documents d
   join public.invitations i on i.id = d.invitation_id
   where d.state #>> '{service,status}' = 'submitted'
     and d.state ->> 'assignedAdminId' is null;
   ```

3. Ganti kedua UUID pada perintah berikut, lalu jalankan. Fungsi commit memeriksa versi dokumen, memvalidasi peran admin, menyinkronkan `invitation_members`, dan mencatat aksi penugasan.

   ```sql
   select public.commit_invitation_document(
     d.invitation_id,
     d.version,
     jsonb_set(
       d.state, '{assignedAdminId}',
       to_jsonb('GANTI_DENGAN_UUID_ADMIN'::text), true
     ),
     null,
     'invitation.assign_admin'
   )
   from public.invitation_documents d
   where d.invitation_id = 'GANTI_DENGAN_UUID_UNDANGAN'::uuid
     and d.state #>> '{service,status}' = 'submitted'
     and d.state ->> 'assignedAdminId' is null
     and exists (
       select 1 from public.profiles p
       where p.id = 'GANTI_DENGAN_UUID_ADMIN'::uuid
         and p.role = 'admin'
     );
   ```

   Perintah harus mengembalikan satu baris berisi versi dokumen baru. Bila tidak ada baris, periksa ulang UUID, status permintaan, dan peran admin. Bila muncul konflik versi, baca ulang antrean lalu coba lagi.

4. Periksa bahwa `state.assignedAdminId` dan `invitation_members.user_id` sama dengan UUID admin, kemudian masuk sebagai admin itu dan pastikan pekerjaan muncul di `/admin`.

   ```sql
   select d.state ->> 'assignedAdminId' as assigned_admin_id,
          m.user_id as membership_admin_id
   from public.invitation_documents d
   left join public.invitation_members m
     on m.invitation_id = d.invitation_id and m.role = 'assigned_admin'
   where d.invitation_id = 'GANTI_DENGAN_UUID_UNDANGAN'::uuid;
   ```

RPC mencatat aksi `invitation.assign_admin` dengan `actor_id` kosong untuk prosedur operator ini. Catat identitas operator dan alasan penugasan pada jurnal operasional sampai panel penugasan dengan audit identitas tersedia.
