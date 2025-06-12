import { v2 as cloudinary } from "cloudinary";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./env";

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

export function getSignedCloudinaryUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    type: "authenticated", // or "private" if using strict access mode
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 10, // 10 min expiry
    secure: true,
  });
}
