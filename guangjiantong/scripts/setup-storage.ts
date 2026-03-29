import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim();
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const buckets = [
  {
    id: 'gjtong-uploads',
    options: {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024, // 20MB
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    },
  },
  {
    id: 'gjtong-outputs',
    options: {
      public: false,
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
  },
];

async function main() {
  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket.id, bucket.options);

    if (error && error.message.includes('already exists')) {
      // Update existing bucket to ensure MIME types are current
      const { error: updateError } = await supabase.storage.updateBucket(bucket.id, bucket.options);
      if (updateError) {
        console.error(`✗ Failed to update "${bucket.id}":`, updateError.message);
        process.exit(1);
      }
      console.log(`✓ Bucket "${bucket.id}" already exists, updated config.`);
    } else if (error) {
      console.error(`✗ Failed to create "${bucket.id}":`, error.message);
      process.exit(1);
    } else {
      console.log(`✓ Created bucket "${bucket.id}".`);
    }
  }

  console.log('\nStorage setup complete.');
}

main();
