import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, getVideos, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();
const MAX_UPLOAD_SIZE = 10 << 20 //10MB

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  // TODO: implement the upload here
  const formData = await req.formData()
  const parsed = formData.get("thumbnail")

  if (!(parsed instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (MAX_UPLOAD_SIZE < parsed.size) {
    throw new BadRequestError("File is too big. Max 10MB");
  }

  const mediaType = parsed.type
  const imageData = await parsed.arrayBuffer()
  
  const videoMetadata = getVideo(cfg.db, videoId)
  console.log(videoMetadata, userID)

  if (!videoMetadata || videoMetadata.userID !== userID) {
    throw new UserForbiddenError("")
  }

  videoThumbnails.set(videoMetadata.id, {data: imageData, mediaType: mediaType})

  videoMetadata.thumbnailURL = `http://localhost:${cfg.port}/api/thumbnails/${videoId}`

  updateVideo(cfg.db, videoMetadata)

  

  return respondWithJSON(200, videoMetadata);
}
