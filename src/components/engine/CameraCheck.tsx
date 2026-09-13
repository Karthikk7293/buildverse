"use client";
import { useEffect } from "react";
import { useHandTracking } from "@/hooks/useHandTracking";
import { LabIcon } from "./LabIcon";

export default function CameraCheck() {
  const camera = useHandTracking(() => {}, false);
  const active = camera.status === "requesting" || camera.previewLive;
  useEffect(() => { void camera.refreshDevices(); }, [camera.refreshDevices]);
  return <main className="camera-check-page">
    <a className="camera-check-back" href="/"><LabIcon name="arrow" size={15}/> Back to Buildverse</a>
    <div className="eyebrow">BUILDVERSE · CAMERA DIAGNOSTICS</div>
    <h1>Does your camera work?</h1>
    <p className="camera-check-intro">A simple live preview, without the 3D engine or hand tracker. No camera app installation needed.</p>
    <div className="camera-check-card">
      <div className={`camera-preview ${camera.previewLive ? "live" : ""}`}>
        <video ref={camera.videoRef} muted playsInline autoPlay/>
        {!camera.previewLive && <div className="camera-placeholder"><LabIcon name={camera.error ? "cameraOff" : "camera"} size={40}/><span>{camera.status === "requesting" ? camera.detail : "Press Test camera to open a live preview"}</span></div>}
        <span className="preview-badge"><span className={`status-dot ${camera.previewLive ? "" : "amber"}`}/>{camera.previewLive ? "LIVE CAMERA" : "CAMERA OFF"}</span>
      </div>
      <div className="camera-check-controls">
        <label>Camera<select aria-label="Choose camera" value={camera.selectedDevice} onChange={(event) => camera.selectDevice(event.target.value)}><option value="">Automatic camera</option>{camera.devices.filter((device) => device.id).map((device) => <option value={device.id} key={device.id}>{device.label}</option>)}</select></label>
        <button className="secondary-button" onClick={() => void camera.refreshDevices()}>Refresh cameras</button>
        <button className="primary-button" onClick={() => active ? camera.stop() : void camera.start()}><LabIcon name={active ? "cameraOff" : "camera"} size={17}/>{active ? "Stop camera" : "Test camera"}</button>
      </div>
      <div className="camera-check-result" role="status"><strong>{camera.previewLive ? "Your camera is delivering video." : camera.status === "requesting" ? "Opening camera…" : `${camera.devices.length} camera inputs reported by this browser.`}</strong><p>{camera.detail || "Allow camera permission when prompted. Device lists can be limited before permission is granted."}</p>{camera.cameraName && <p>{camera.cameraName}</p>}</div>
      {camera.error && <p className="camera-error" role="alert">{camera.error}</p>}
      {camera.previewLive && <a className="camera-check-link" href="/">Camera works · return to the engine and enable hand controls <LabIcon name="arrow" size={14}/></a>}
    </div>
    <section className="camera-check-notes"><h2>If no camera appears</h2><ol><li>Open the laptop’s lens shutter and check its camera/privacy switch.</li><li>Allow camera access in the browser’s site settings, then refresh the camera list.</li><li>If Google Meet and this test both fail, check the system camera setting or try a USB webcam.</li><li>On a Dell Latitude 7420, the BIOS camera option is under <strong>Integrated Devices → Enable Camera</strong>. <a href="https://www.dell.com/support/kbdoc/en-us/000185666/latitude-7420-7320-7520-and-5420-the-integrated-camera-is-disabled-after-bios-recovery" target="_blank" rel="noreferrer">Dell’s instructions ↗</a></li></ol><p>Preview stays on this device. This page does not record video or request microphone access.</p></section>
  </main>;
}
