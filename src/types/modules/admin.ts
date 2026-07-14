// Types para o sistema de grupos e permissões

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  added_by: string | null;
  added_at: string;
}

export interface Permission {
  id: string;
  module: 'estoque' | 'certificados' | 'ged' | 'admin';
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'download' | 'upload' | 'manage';
  description: string | null;
  created_at: string;
}

export interface GroupPermission {
  group_id: string;
  permission_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface UserGroupWithMembers extends UserGroup {
  members: (GroupMember & { profile: { email: string; full_name: string } })[];
  member_count: number;
}

export interface UserGroupWithPermissions extends UserGroup {
  permissions: (GroupPermission & { permission: Permission })[];
  permission_count: number;
}

export interface UserPermissions {
  module: string;
  resource: string;
  action: string;
  description: string;
}
