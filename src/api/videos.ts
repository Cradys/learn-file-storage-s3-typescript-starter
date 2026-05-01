import { respondWithJSON } from "./json";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import type { Video } from "../db/videos";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { type ApiConfig } from "../config";
import { S3Client, type BunRequest } from "bun";
import { randomBytes } from "node:crypto";
import path from 'node:path';

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30
  const { videoId } = req.params as { videoId?: string }

  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId)

  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }

  const formData = await req.formData()
  const file = formData.get("video")

  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  const mediaType = file.type
  const fileType = mediaType.split("/")[1]

  if (MAX_UPLOAD_SIZE < file.size) {
    throw new BadRequestError("File is too big. Max 10MB");
  }

  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Invalid file type. Only MP4 allowed.");
  }

  const randomB = randomBytes(32)
  const fileName = randomB.toString("base64url")
  const fileNameAndExtencion = `${fileName}.${fileType}`

  const filePath = path.join(cfg.assetsRoot, fileNameAndExtencion)
  
  await Bun.write(filePath, file)

  const aspectRatio = await getVideoAspectRatio(filePath)
  const s3FilePath = `${aspectRatio}/${fileName}.${fileType}`

  const client = cfg.s3Client

  const s3File = client.file(s3FilePath)

  const fastStartPath = await processVideoForFastStart(filePath)
  await Bun.file(filePath).delete()
  const localFile = Bun.file(fastStartPath)

  await s3File.write(localFile)
  await localFile.delete()


  video.videoURL = `${cfg.s3CfDistribution}/${s3FilePath}`
  await updateVideo(cfg.db, video)




  return respondWithJSON(200, video);
}


export async function getVideoAspectRatio(filePath: string): Promise<string> {
  const proc = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath])

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new BadRequestError(`Can't save file. Error: ${stderrText}`)
  }
  const parsed = JSON.parse(stdoutText) as { streams: { width: number; height: number }[] }
  const height = parsed.streams[0].height
  const width = parsed.streams[0].width

  switch (Math.floor((width / height) * 10)) {
    case 17: 
      return "landscape"
    case 5: 
      return "portrait"
    default:
      return "other"
  }


}


export async function processVideoForFastStart(filePath: string) {
  const fastStartPath = filePath + ".processed.mp4"
  const proc = Bun.spawn(["ffmpeg", "-i", filePath, "-movflags", "faststart", "-map_metadata", "0", "-codec", "copy", "-f", "mp4", fastStartPath])
  const errorText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`FFmpeg error: ${errorText}`);
  }
  return fastStartPath
}
