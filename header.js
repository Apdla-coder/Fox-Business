function toggleMenu() {
  const menu = document.getElementById("navMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}

document.addEventListener("click", function (e) {
  const menu = document.getElementById("navMenu");
  const button = e.target.closest("button");
  if (!menu.contains(e.target) && !button) {
    menu.style.display = "none";
  }
});
