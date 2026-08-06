import { createClient } from '@supabase/supabase-js';

// Utan miljövariabler i en production-build: fail högt hellre än att tyst
// koppla mot fel databas. I lokal utveckling: fall tillbaka till staging
// (ALDRIG production) så ett saknat .env.local inte råkar peka mot skarp data.
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.PROD) {
    throw new Error(
      'VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY saknas i en production-build. Kontrollera miljövariablerna i Vercel.'
    );
  }
  console.warn('VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY saknas lokalt — faller tillbaka till staging.');
  supabaseUrl = 'https://eyksngvbrupmxpjzadqp.supabase.co';
  supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5a3NuZ3ZicnVwbXhwanphZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NDI3NjksImV4cCI6MjEwMDExODc2OX0.gx-nYj0wCnnlQmFSwUSBYy6fjxpH6njcu8X_Z7PtHAw';
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types (will be auto-generated later, but here's a basic structure)
export interface Provider {
  id: string;
  name: string;
  type: 'universitet' | 'högskola' | 'yrkeshögskola';
  description: string;
  logo_url?: string;
  website_url?: string;
  contact_email?: string;
  contact_phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
}

export interface Training {
  id: string;
  title: string;
  description: string;
  course_code?: string;
  provider_id: string;
  category_id: string;
  format: 'online' | 'onsite' | 'hybrid';
  duration: string;
  credits: number;
  target_audience: string;
  image_url: string;
  training_type: 'custom' | 'scheduled' | 'both';
  is_popular: boolean;
  featured: boolean;
  views: number;
  leads: number;
  learning_outcomes?: string[];
  esco_skills?: { title: string; uri: string }[];
  instructor_name?: string;
  instructor_title?: string;
  instructor_bio?: string;
  contact_person_name?: string;
  contact_person_title?: string;
  contact_person_email?: string;
  contact_person_phone?: string;
  contact_person_response_time?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledStart {
  id: string;
  training_id: string;
  start_date: string;
  application_deadline: string;
  price: number;
  max_participants: number;
  available_spots: number;
  status: 'open' | 'few_spots' | 'full' | 'upcoming';
  location?: string;
  language: string;
  admission_requirements?: string;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  scheduled_start_id: string;
  training_id: string;
  student_name: string;
  student_email: string;
  student_phone: string;
  company: string;
  department?: string;
  status: 'new' | 'reviewed' | 'confirmed' | 'declined';
  notes?: string;
  submitted_at: string;
  updated_at: string;
}

export interface CustomRequest {
  id: string;
  training_id?: string;
  company: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  course_topic: string;
  description: string;
  budget?: string;
  timeline: string;
  participants_count: string;
  ai_score: 'high' | 'medium' | 'low';
  status: 'new' | 'responded' | 'negotiating' | 'accepted' | 'declined';
  response?: string;
  recommended_categories?: string[];
  has_provider_match?: boolean;
  submitted_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email?: string;
  role: 'admin' | 'provider';
  provider_id?: string;
  full_name: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
