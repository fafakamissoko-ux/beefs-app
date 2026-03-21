# Supabase Storage Setup for Avatars

## 1. Create Storage Bucket

In your Supabase Dashboard:
1. Go to **Storage** section
2. Click **New Bucket**
3. Name: `avatars`
4. Public: `Yes` (so avatars can be viewed publicly)
5. File size limit: `5 MB` (recommended for avatars)
6. Allowed MIME types: `image/*`

## 2. Storage Policies (RLS)

Add these policies to the `avatars` bucket:

### Policy 1: Public Read
- **Name**: `Public avatar access`
- **Operation**: `SELECT`
- **Policy**: `true` (allow everyone to read)
- **SQL**:
```sql
CREATE POLICY "Public avatar access" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');
```

### Policy 2: Authenticated Upload
- **Name**: `Users can upload their own avatar`
- **Operation**: `INSERT`
- **Policy**: Check if user is authenticated
- **SQL**:
```sql
CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 3: Authenticated Update
- **Name**: `Users can update their own avatar`
- **Operation**: `UPDATE`
- **SQL**:
```sql
CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy 4: Authenticated Delete
- **Name**: `Users can delete their own avatar`
- **Operation**: `DELETE`
- **SQL**:
```sql
CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

## 3. Database Schema Update

Add `avatar_url` column to `users` table if not exists:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_settings JSONB DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb;
```

## 4. Test Upload

After setup:
1. Go to http://localhost:3000/profile
2. Click on the camera icon on your avatar
3. Upload an image
4. Check Supabase Storage to see if it appears in `avatars/` bucket

## Notes

- Avatar files are stored as: `avatars/{user_id}-{random}.{ext}`
- Public URLs are automatically generated
- Old avatars are NOT automatically deleted (implement cleanup if needed)
- Max file size: 5MB (adjust in bucket settings if needed)
