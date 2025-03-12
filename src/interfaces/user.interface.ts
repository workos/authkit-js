export interface User {
  object: "user";
  id: string;
  email: string;
  emailVerified: boolean;
  profilePictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: string | null;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRaw {
  object: "user";
  id: string;
  email: string;
  email_verified: boolean;
  profile_picture_url: string | null;
  first_name: string | null;
  last_name: string | null;
  last_sign_in_at: string | null;
  external_id?: string;
  created_at: string;
  updated_at: string;
}
