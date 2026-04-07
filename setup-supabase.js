/**
 * Supabase Database Setup Script
 * Run this to set up the vector database tables
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

async function setupDatabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found!');
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env.local file');
    process.exit(1);
  }

  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test connection
    const { data, error } = await supabase.from('document_chunks').select('count').limit(1);
    if (error && error.code === 'PGRST116') {
      console.log('📋 Table does not exist. Creating...');

      // Read the schema file
      const schemaPath = path.join(__dirname, '../../supabase-schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      // Split into individual statements
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`Executing: ${statement.substring(0, 50)}...`);
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          if (error) {
            console.error('Error executing statement:', error);
            console.error('Statement:', statement);
          }
        }
      }

      console.log('✅ Database setup complete!');
    } else if (error) {
      console.error('❌ Database connection error:', error);
    } else {
      console.log('✅ Database table already exists!');
    }
  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupDatabase();
