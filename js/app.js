const cameraBtn = document.getElementById("cameraBtn");
const addPinBtn = document.getElementById("addPin");

cameraBtn.addEventListener("click", startCamera);
addPinBtn.addEventListener("click", loadNearbyPins);