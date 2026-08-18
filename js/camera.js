async function startCamera() {
  const camera = document.getElementById("camera");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  camera.srcObject = stream;
}