"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createGroup(formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("user_groups")
    .insert({
      name,
      description: description || null,
      created_by: user.id,
    });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
}

export async function updateGroup(groupId: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  const { error } = await supabase
    .from("user_groups")
    .update({
      name,
      description: description || null,
    })
    .eq("id", groupId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function deleteGroup(groupId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_groups")
    .delete()
    .eq("id", groupId);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/admin/grupos");
}

export async function addGroupMember(groupId: string, userId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("group_members")
    .insert({
      group_id: groupId,
      user_id: userId,
      added_by: user.id,
    });

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function removeGroupMember(groupId: string, userId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function addGroupPermission(groupId: string, permissionId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("group_permissions")
    .insert({
      group_id: groupId,
      permission_id: permissionId,
      granted_by: user.id,
    });

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}

export async function removeGroupPermission(groupId: string, permissionId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("group_permissions")
    .delete()
    .eq("group_id", groupId)
    .eq("permission_id", permissionId);

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/admin/grupos/${groupId}`);
}
