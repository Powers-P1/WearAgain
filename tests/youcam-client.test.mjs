import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import {
  YouCamClient, YouCamError, YOUCAM_API_ORIGIN, YOUCAM_IMAGE_UNITS,
  YOUCAM_RATE_WINDOW_MS, YOUCAM_RATE_WINDOW_REQUESTS, YOUCAM_RATE_SECOND_REQUESTS,
  YOUCAM_RETENTION_MS, inspectImage,
} from "../dist/youcam/index.js";

const shape = JSON.parse(await readFile(new URL("../fixtures/youcam/cloth_tryon_task.synthetic.json", import.meta.url), "utf8"));
const asset = "https://yce-us.s3-accelerate.amazonaws.com/synthetic/image.png?signature=synthetic";
const key = "fixture-secret-never-log";
const api = YOUCAM_API_ORIGIN;
const filePath = "/s2s/v2.0/file/cloth";
const taskPath = "/s2s/v2.0/task/cloth-v4";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}
function png(width = 512, height = 384) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]));
}
const bytes = png();
const image = { bytes, contentType: "image/png", fileName: "synthetic.png" };
const clone = value => structuredClone(value);
function fileResponse(fileId = "opaque_file_id", modify = () => {}) {
  const body = clone(shape.file_api_response);
  const file = body.data.files[0];
  Object.assign(file, { content_type: "image/png", file_name: image.fileName, file_id: fileId });
  Object.assign(file.requests[0], { url: asset, headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length) } });
  modify(body);
  return body;
}
function taskResponse() {
  const body = clone(shape.create_task_response);
  body.data.task_id = "opaque_task_id";
  return body;
}
function successResponse() {
  const body = clone(shape.poll_success);
  body.data.results.url = asset;
  return body;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function queue(responses, options = {}) {
  const requests = [];
  const gates = [];
  const client = new YouCamClient({
    apiKey: key,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.ok(responses.length, "unexpected network request");
      const next = responses.shift();
      return typeof next === "function" ? next(url, init) : next;
    },
    beforeRequest: async kind => { gates.push(kind); },
    ...options,
  });
  return { client, requests, gates };
}
function assertError(error, kind, operation, free = false) {
  assert.ok(error instanceof YouCamError);
  assert.equal(error.kind, kind);
  assert.equal(error.operation, operation);
  assert.equal(error.confirmedNoCharge, free);
  assert.ok(!String(error).includes(key));
  assert.ok(!JSON.stringify(error).includes(key));
  return true;
}

test("replays the observed fixture shape: two uploads, cloth-v4, polling and result bytes", async () => {
  const { client, requests, gates } = queue([
    json(fileResponse("src_id")), new Response(null, { status: 200 }),
    json(fileResponse("ref_id")), new Response(null, { status: 204 }),
    json(taskResponse()), json(shape.poll_running), json(successResponse()),
    new Response(bytes, { headers: { "Content-Type": "image/png", "Content-Length": String(bytes.length) } }),
  ]);
  const src = await client.uploadImage(image);
  const ref = await client.uploadImage(image);
  const task = await client.createTask({ srcFileId: src.fileId, refFileId: ref.fileId });
  assert.equal(task.taskId, "opaque_task_id");
  assert.deepEqual(await client.getTask(task.taskId), { status: "pending" });
  const result = await client.getTask(task.taskId);
  assert.equal(result.status, "success");
  const downloaded = await client.downloadResult(result.resultUrl);
  assert.deepEqual(downloaded.bytes, bytes);
  assert.equal(downloaded.contentType, "image/png");
  assert.deepEqual(gates, ["api", "upload", "api", "upload", "api", "api", "api", "download"]);
  assert.equal(requests[0].url, api + filePath);
  assert.deepEqual(JSON.parse(requests[0].init.body), { files: [{ content_type: "image/png", file_name: image.fileName, file_size: bytes.length }] });
  assert.equal(requests[4].url, api + taskPath);
  assert.deepEqual(JSON.parse(requests[4].init.body), { src_file_id: "src_id", ref_file_id: "ref_id", garment_category: "upper_body" });
  assert.equal(requests[5].url, api + taskPath + "/opaque_task_id");
  for (const request of requests) {
    assert.equal(request.init.redirect, "manual");
    const headers = new Headers(request.init.headers);
    if (request.url.startsWith(api)) assert.equal(headers.get("authorization"), "Bearer " + key);
    else { assert.equal(headers.get("authorization"), null); assert.equal(request.init.credentials, "omit"); }
  }
  assert.equal(new Headers(requests[1].init.headers).get("content-length"), String(bytes.length));
});

test("probe-backed cost, retention and rate constants", () => {
  assert.equal(YOUCAM_IMAGE_UNITS, shape.units.cost_per_result_image);
  assert.equal(YOUCAM_IMAGE_UNITS, 2);
  assert.equal(YOUCAM_RETENTION_MS, 24 * 60 * 60 * 1000);
  assert.equal(YOUCAM_RATE_WINDOW_REQUESTS, 250);
  assert.equal(YOUCAM_RATE_WINDOW_MS, 300000);
  assert.equal(YOUCAM_RATE_SECOND_REQUESTS, 5);
});

test("only confirmed terminal decode failure is automatically refundable", async () => {
  const unfamiliar = clone(shape.poll_error);
  unfamiliar.data.error = "unknown_internal_error";
  const { client } = queue([json(shape.poll_error), json(unfamiliar)]);
  assert.deepEqual(await client.getTask("task"), { status: "error", errorCode: "error_decode_image", confirmedNoCharge: true });
  assert.deepEqual(await client.getTask("task"), { status: "error", errorCode: "unknown_internal_error", confirmedNoCharge: false });
});

test("create InvalidParameters 400 is confirmed free and is never retried", async () => {
  const { client, requests } = queue([json(shape.validation_error_400, 400)]);
  await assert.rejects(client.createTask({ srcFileId: "src", refFileId: "ref" }), error => assertError(error, "http", "createTask", true));
  assert.equal(requests.length, 1);
});

for (const status of [400, 401, 404, 429, 500, 503]) {
  test(`HTTP ${status} without exact confirmation never releases or retries a task`, async () => {
    const { client, requests } = queue([json({ status, error: key, error_code: "UNKNOWN" }, status)]);
    await assert.rejects(client.createTask({ srcFileId: "src", refFileId: "ref" }), error => assertError(error, "http", "createTask"));
    assert.equal(requests.length, 1);
  });
}

test("poll InvalidParameters is not mistaken for a rejected task creation", async () => {
  const { client } = queue([json(shape.validation_error_400, 400)]);
  await assert.rejects(client.getTask("task"), error => assertError(error, "http", "getTask"));
});

test("network and timeout errors remain ambiguous and contain no upstream cause", async () => {
  const network = queue([() => { throw new Error(key); }]);
  await assert.rejects(network.client.createTask({ srcFileId: "src", refFileId: "ref" }), error => assertError(error, "network", "createTask"));
  let signal;
  const timed = queue([(_, init) => { signal = init.signal; return new Promise(() => {}); }], { requestTimeoutMs: 5 });
  await assert.rejects(timed.client.createTask({ srcFileId: "src", refFileId: "ref" }), error => assertError(error, "timeout", "createTask"));
  assert.equal(signal.aborted, true);
  assert.equal(timed.requests.length, 1);
});

test("request deadline also covers a stalled response body", async () => {
  const { client } = queue([new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } })], { requestTimeoutMs: 5 });
  await assert.rejects(client.createTask({ srcFileId: "src", refFileId: "ref" }), error => assertError(error, "timeout", "createTask"));
});

test("rate-gate refusal happens before transport", async () => {
  const { client, requests } = queue([], { beforeRequest: async () => { throw new Error("rate_gate_closed"); } });
  await assert.rejects(client.createTask({ srcFileId: "src", refFileId: "ref" }), /rate_gate_closed/);
  assert.equal(requests.length, 0);
});

test("invalid response shapes remain ambiguous", async () => {
  const responses = [
    new Response("not json"), json({ status: 200, data: {} }),
    json({ status: 200, data: { task_status: "success", error: null, results: [] } }),
    json({ status: 200, data: { task_status: "running", error: "unexpected", results: null } }),
  ];
  for (const response of responses) {
    const { client } = queue([response]);
    await assert.rejects(client.getTask("task"), error => assertError(error, "protocol", "getTask"));
  }
});

test("asset URLs require an exact approved HTTPS hostname and no credentials", async () => {
  for (const url of ["http://yce-us.s3-accelerate.amazonaws.com/x", "https://127.0.0.1/x", "https://localhost/x", "https://evil.example/x", "https://user:secret@yce-us.s3-accelerate.amazonaws.com/x", "https://yce-us.s3-accelerate.amazonaws.com.evil.example/x", "https://yce-us.s3-accelerate.amazonaws.com:444/x", asset + "#fragment"]) {
    const { client, requests } = queue([]);
    await assert.rejects(client.downloadResult(url), error => assertError(error, "protocol", "downloadResult"));
    assert.equal(requests.length, 0);
  }
});

test("additional provider hosts require explicit trusted configuration", async () => {
  const { client, requests } = queue([new Response(bytes, { headers: { "Content-Type": "image/png" } })], { allowedAssetHosts: ["assets.provider.example"] });
  await client.downloadResult("https://assets.provider.example/result.png");
  assert.equal(requests.length, 1);
  assert.throws(() => new YouCamClient({ apiKey: key, allowedAssetHosts: ["*.amazonaws.com"] }), YouCamError);
  assert.throws(() => new YouCamClient({ apiKey: key, allowedAssetHosts: ["127.0.0.1"] }), YouCamError);
});

test("upload response rejects unsafe URL, wrong method and credential header injection", async () => {
  const mutations = [
    body => { body.data.files[0].requests[0].url = "https://evil.example/collect"; },
    body => { body.data.files[0].requests[0].method = "POST"; },
    body => { body.data.files[0].requests[0].headers.Authorization = "Bearer " + key; },
    body => { body.data.files[0].requests[0].headers.Cookie = "session=secret"; },
    body => { body.data.files[0].requests[0].headers["Content-Length"] = "1"; },
    body => { body.data.files[0].requests[0].headers["content-length"] = String(bytes.length); },
    body => { body.data.files[0].requests[0].headers["Content-Type"] = "image/jpeg"; },
  ];
  for (const mutate of mutations) {
    const { client, requests } = queue([json(fileResponse("file", mutate))]);
    await assert.rejects(client.uploadImage(image), error => assertError(error, "protocol", "uploadImage"));
    assert.equal(requests.length, 1);
  }
});

test("upload payload is a detached snapshot while transport awaits", async () => {
  const original = new Uint8Array(bytes);
  const { client, requests } = queue([json(fileResponse()), new Response(null, { status: 204 })], {
    beforeRequest: async () => { original.fill(42); },
  });
  await client.uploadImage({ ...image, bytes: original });
  assert.deepEqual(new Uint8Array(requests[1].init.body), bytes);
});

test("input dimensions, MIME, path-like names and empty images fail before network", async () => {
  const { client, requests } = queue([]);
  for (const input of [
    { ...image, bytes: new Uint8Array() }, { ...image, contentType: "image/jpeg" },
    { ...image, fileName: "../private.png" }, { ...image, bytes: png(128, 128) },
    { ...image, bytes: png(4097, 384) }, { ...image, bytes: new Uint8Array(10_000_000) },
  ]) await assert.rejects(client.uploadImage(input), error => assertError(error, "input", "uploadImage"));
  assert.equal(requests.length, 0);
  assert.deepEqual(inspectImage(bytes, "image/png", "uploadImage"), { width: 512, height: 384 });
});

test("JPEG SOF dimensions are read without a Node-specific decoder", () => {
  // Deliberately just an image header: the client does not claim to decode image pixels.
  const jpegHeader = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 1, 128, 2, 0, 1, 1, 17, 0, 255, 217]);
  assert.deepEqual(inspectImage(jpegHeader, "image/jpeg", "uploadImage"), { width: 512, height: 384 });
  assert.throws(() => inspectImage(jpegHeader.subarray(0, 10), "image/jpeg", "uploadImage"), YouCamError);
});

test("downloads reject non-image bodies, advertised oversize, streaming oversize and redirects", async () => {
  const responses = [
    new Response("<script>bad</script>", { headers: { "Content-Type": "text/html" } }),
    new Response(bytes, { headers: { "Content-Type": "image/png", "Content-Length": "10000000" } }),
    new Response(new Uint8Array(10_000_000), { headers: { "Content-Type": "image/png" } }),
    new Response(null, { status: 302, headers: { Location: "https://evil.example/image" } }),
  ];
  for (const response of responses) {
    const { client, requests } = queue([response]);
    await assert.rejects(client.downloadResult(asset), YouCamError);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.redirect, "manual");
  }
});

test("task identifiers cannot escape the fixed polling endpoint", async () => {
  for (const taskId of ["..", "../credit", "task?admin=1", "https://evil.example", "x/y", ""]) {
    const { client, requests } = queue([]);
    await assert.rejects(client.getTask(taskId), YouCamError);
    assert.equal(requests.length, 0);
  }
});

test("the frozen JSON fixture is schema evidence, not a replayable credential or result URL", () => {
  assert.equal(shape.metadata.synthetic, true);
  assert.equal(shape.metadata.no_raw_api_data, true);
  assert.equal(shape.file_api_request.POST, filePath);
  assert.equal(shape.create_task_request.POST, "/s2s/v2.0/task/cloth");
  assert.equal(shape.poll_success.data.results.url, "<presigned_result_url_short_lived>");
});
