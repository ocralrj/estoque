export type UserRole = "super_admin" | "gestor" | "uploader" | "viewer";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  added_by: string | null;
  added_at: string;
}

export interface Certificate {
  id: string;
  title: string;
  description: string | null;
  issuer: string;
  issued_to: string;
  issued_date: string;
  expiry_date: string | null;
  category: string | null;
  tags: string[] | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  is_expired: boolean;
  created_at: string;
}

export interface CertificateAccess {
  id: string;
  certificate_id: string;
  group_id: string;
  granted_by: string;
  granted_at: string;
}

export interface DownloadLog {
  id: string;
  certificate_id: string;
  user_id: string;
  downloaded_at: string;
  ip_address: string | null;
}

export interface CertificateWithAccess extends Certificate {
  uploader?: Profile;
  groups?: Group[];
  download_count?: number;
}
