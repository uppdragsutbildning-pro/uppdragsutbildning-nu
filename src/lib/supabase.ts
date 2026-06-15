import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// In production, these should be environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iswctazjdtirrzswqkor.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlzd2N0YXpqZHRpcnJ6c3dxa29yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDA4NTcsImV4cCI6MjA5NTg3Njg1N30.gkRkttHD6skjModVTUvCA_vFPec0OjoGNHHOfLQxqMQ';

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
