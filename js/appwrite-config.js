/* =========================================================================
   EGO-META — Configuration Appwrite
   -------------------------------------------------------------------------
   1. Va sur cloud.appwrite.io → ton projet → "Settings"
   2. Copie le Project ID et le Endpoint
   3. Dans "Database" → copie le Database ID
   ========================================================================= */

const EGO_CONFIG = {
  appwriteEndpoint: "https://cloud.appwrite.io/v1",   // ou ton endpoint auto-hébergé
  appwriteProjectId: "TON_PROJECT_ID",                 // ex: "67a1b2c3d4e5f6789"
  appwriteDatabaseId: "ego-meta-db",                   // ID de ta DB Appwrite
  siteName: "EGO-META",
  inviteHint: "Demandez un code d'invitation à l'administrateur du site."
};

// IDs des collections — doivent correspondre exactement aux IDs dans Appwrite Dashboard
const COLLECTIONS = {
  profiles:              "profiles",
  conversations:         "conversations",
  conversation_members:  "conversation_members",
  groups:                "groups",
  communities:           "communities",
  community_members:     "community_members",
  channels:              "channels",
  channel_categories:    "channel_categories",
  messages:              "messages",
  message_reactions:     "message_reactions",
  message_hidden_for:    "message_hidden_for",
  notifications:         "notifications",
  invite_codes:          "invite_codes",
  stories:               "stories",
  story_views:           "story_views",
};

// IDs des buckets Storage Appwrite
const BUCKETS = {
  avatars:     "avatars",
  attachments: "attachments",
  media:       "media",
};
