import argparse
import asyncio
import json
import logging
import os
from pyppeteer import launch
from threading import Thread
import traceback

import cv2
from aiohttp import web
from av import VideoFrame
import base64

from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaBlackhole, MediaPlayer, MediaRecorder

ROOT = os.path.dirname(__file__)

async def index(request):
    content = open(os.path.join(ROOT, 'index.html'), 'r').read()
    return web.Response(content_type='text/html', text=content)


async def javascript(request):
    content = open(os.path.join(ROOT, 'client.js'), 'r').read()
    return web.Response(content_type='application/javascript', text=content)

async def cloud_browser(channel, closed, queue):
    browser = await launch({'headless': True})
    # browser = await launch()

    page = await browser.newPage()
    await page.goto('https://www.google.com')
    while True:
        await asyncio.sleep(1.0/30)
        if closed.is_set():
            break

        try:
            message = queue.get_nowait()
            #x, y = message.split(",")
            #await page.mouse.click(int(x), int(y))
            try:
                await eval("page." + message)
            except Exception as e:
                print(e)
                traceback.print_exc()
        except:
            pass

        #await page.mouse.move(100, 100)
        #print("OK")
        await page.screenshot({'path': 'screenshot.png'})
        with open("screenshot.png", "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read())
            channel.send(encoded_string.decode('utf-8'))
    await browser.close()


async def offer(request):
    params = await request.json()
    offer = RTCSessionDescription(
        sdp=params['sdp'],
        type=params['type'])

    pc = RTCPeerConnection()
    pcs.add(pc)

    # prepare local media
    player = MediaPlayer(os.path.join(ROOT, 'demo-instruct.wav'))
    if args.write_audio:
        recorder = MediaRecorder(args.write_audio)
    else:
        recorder = MediaBlackhole()

    @pc.on('datachannel')
    async def on_datachannel(channel):
        closed = asyncio.Event()
        queue = asyncio.Queue()

        print("Channel opened")

        @channel.on('close')
        def on_close():
            print("Channel closed")
            closed.set()

        @channel.on('message')
        async def on_message(message):
            await queue.put(message)
            #channel.send(message)
            print(message)

        await cloud_browser(channel, closed, queue)

    @pc.on('iceconnectionstatechange')
    async def on_iceconnectionstatechange():
        print('ICE connection state is %s' % pc.iceConnectionState)
        if pc.iceConnectionState == 'failed':
            await pc.close()
            pcs.discard(pc)

    # handle offer
    await pc.setRemoteDescription(offer)
    await recorder.start()

    # send answer
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type='application/json',
        text=json.dumps({
            'sdp': pc.localDescription.sdp,
            'type': pc.localDescription.type
        }))


pcs = set()


async def on_shutdown(app):
    # close peer connections
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='WebRTC audio / video / data-channels demo')
    parser.add_argument('--port', type=int, default=8080,
                        help='Port for HTTP server (default: 8080)')
    parser.add_argument('--verbose', '-v', action='count')
    parser.add_argument('--write-audio', help='Write received audio to a file')
    args = parser.parse_args()
    print(args)

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)

    app = web.Application()
    app.on_shutdown.append(on_shutdown)
    app.router.add_get('/', index)
    app.router.add_get('/client.js', javascript)
    app.router.add_post('/offer', offer)
    web.run_app(app, port=args.port)
