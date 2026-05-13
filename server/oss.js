import OSS from 'ali-oss'

export const ossConfig = {
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  endpoint: process.env.OSS_ENDPOINT,
  publicEndpoint: process.env.OSS_PUBLIC_ENDPOINT,
  dataDir: process.env.OSS_DATA_DIR || 'data'
}

const client = new OSS({
  region: ossConfig.region,
  accessKeyId: ossConfig.accessKeyId,
  accessKeySecret: ossConfig.accessKeySecret,
  bucket: ossConfig.bucket,
  endpoint: ossConfig.endpoint
})

export default client
