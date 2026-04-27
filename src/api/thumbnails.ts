import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from 'node:path';


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
  const file = formData.get("thumbnail")

  const video = getVideo(cfg.db, videoId)

  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (MAX_UPLOAD_SIZE < file.size) {
    throw new BadRequestError("File is too big. Max 10MB");
  }

  const mediaType = file.type
  const fileType = mediaType.split("/")[1]
  const filePath = path.join(cfg.assetsRoot, `${videoId}.${fileType}`)

  

  console.log(filePath)

  await Bun.write(filePath, file)
  
  const dataURL = `http://localhost:${cfg.port}/assets/${videoId}.${fileType}`

  video.thumbnailURL = dataURL

  updateVideo(cfg.db, video)  

  return respondWithJSON(200, video);
}
