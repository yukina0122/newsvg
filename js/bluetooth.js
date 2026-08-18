async function connectEMG() {
  const status = document.getElementById("status");

  if (!navigator.bluetooth) {
    alert("Web Bluetooth非対応");
    return;
  }

  status.textContent = "Bluetooth: 接続要求";
}