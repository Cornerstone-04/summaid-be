import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env";

// Create Supabase client with service role key for admin operations
let supabaseAdmin: ReturnType<typeof createClient> | null = null;

try {
  if (!supabaseAdmin) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    console.log("🔍 Supabase URL:", SUPABASE_URL);
    console.log(
      "🔍 Service role key (first 20 chars):",
      SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + "..."
    );

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log("✅ Supabase Admin client initialized with service role key.");
  }
} catch (error) {
  console.error("❌ Supabase Admin client init failed:", error);
  process.exit(1);
}

// Helper functions to match Firebase Admin patterns
export const db = {
  // Collection-like operations
  from: (table: string) => supabaseAdmin!.from(table),

  // RPC calls for stored procedures
  rpc: (fn: string, args?: any) => supabaseAdmin!.rpc(fn, args),

  // Storage operations
  storage: {
    from: (bucket: string) => supabaseAdmin!.storage.from(bucket),
  },
};

export const auth = {
  // Get user by ID
  getUser: async (uid: string) => {
    const { data, error } = await supabaseAdmin!.auth.admin.getUserById(uid);
    if (error) throw error;
    return data;
  },

  // List users
  listUsers: async (page?: number, perPage: number = 1000) => {
    const { data, error } = await supabaseAdmin!.auth.admin.listUsers({
      page: page || 1,
      perPage,
    });
    if (error) throw error;
    return data;
  },

  // Delete user
  deleteUser: async (uid: string) => {
    const { data, error } = await supabaseAdmin!.auth.admin.deleteUser(uid);
    if (error) throw error;
    return data;
  },

  // Update user
  updateUser: async (uid: string, updates: any) => {
    const { data, error } = await supabaseAdmin!.auth.admin.updateUserById(
      uid,
      updates
    );
    if (error) throw error;
    return data;
  },

  // Create user
  createUser: async (userData: any) => {
    const { data, error } = await supabaseAdmin!.auth.admin.createUser(
      userData
    );
    if (error) throw error;
    return data;
  },
};

// Export the admin client directly if needed
export { supabaseAdmin };

// Default export for convenience
export default supabaseAdmin;
