"use client";

import { useState, useCallback } from "react";
import Image from "next/image";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

interface UploadedImage {
  cloudinary_id: string;
  url: string;
}

export default function ImageUploader({
  images,
  onUpload,
  onRemove,
}: {
  images: UploadedImage[];
  onUpload: (img: UploadedImage) => void;
  onRemove: (cloudinaryId: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      alert("Cloudinary not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET");
      return;
    }

    setUploading(true);
    let uploadedCount = 0;

    const uploads = files.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error.message);
        }
        if (data.public_id && data.secure_url) {
          onUpload({ cloudinary_id: data.public_id, url: data.secure_url });
        }
      } catch (err) {
        console.error("Upload failed", err);
        alert(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        uploadedCount++;
        setProgress(Math.round((uploadedCount / files.length) * 100));
      }
    });

    await Promise.all(uploads);
    setUploading(false);
    setProgress(0);
    e.target.value = "";
  }, [onUpload]);

  return (
    <div>
      <label className="input-label">Product Images</label>

      {/* Current images */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3">
          {images.map((img, i) => (
            <div key={img.cloudinary_id} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              <Image src={img.url} alt={`Product ${i + 1}`} fill className="object-cover" sizes="80px" />
              <button
                onClick={() => onRemove(img.cloudinary_id)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-rose-gold text-white text-[8px] text-center py-0.5">
                  Primary
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <label className={`flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-rose-gold/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="text-center">
          {uploading ? (
            <>
              <div className="w-8 h-8 border-2 border-rose-gold border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-charcoal-lighter">Uploading... {progress}%</p>
            </>
          ) : (
            <>
              <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-sm text-charcoal-lighter">Click to upload images</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 5MB</p>
            </>
          )}
        </div>
        <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
      </label>
    </div>
  );
}
