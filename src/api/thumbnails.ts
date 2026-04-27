import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, getVideos, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";


export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  // TODO: implement the upload here


  const MAX_UPLOAD_SIZE = 10 << 20 //10MB
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
  const buffer = Buffer.from(imageData)
  const base64Encoded = buffer.toString("base64");

  const dataURL = `data:${mediaType};base64,${base64Encoded}`
  
  const video = getVideo(cfg.db, videoId)

  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  video.thumbnailURL = dataURL

  updateVideo(cfg.db, video)  

  return respondWithJSON(200, video);
}
