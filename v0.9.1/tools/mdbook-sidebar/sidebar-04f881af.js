document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector("mdbook-sidebar-accordion");
  const data = globalThis.mdbookSidebar;
  if (!sidebar || !data) {
    return;
  }

  sidebar.querySelectorAll(".on-this-page").forEach((element) => element.remove());

  for (const item of sidebar.querySelectorAll("li.chapter-item")) {
    const wrapper = item.querySelector(":scope > .chapter-link-wrapper");
    const chapterLink = wrapper?.querySelector("a");
    if (!wrapper || !chapterLink) {
      continue;
    }

    const chapterPath = decodeURI(new URL(chapterLink.href).pathname);
    const entry = Object.entries(data.headings).find(([href]) => chapterPath.endsWith(`/${href}`));
    if (!entry || entry[1].length === 0) {
      if (chapterLink.querySelector("strong")) {
        wrapper.classList.add("sidebar-numbered");
      }
      continue;
    }

    const details = document.createElement("details");
    details.className = "chapter-details";
    const summary = document.createElement("summary");
    const list = document.createElement("ol");
    list.className = "section sidebar-headings";

    for (const heading of entry[1]) {
      const headingItem = document.createElement("li");
      headingItem.className = `sidebar-heading sidebar-heading-${heading.depth}`;
      const link = document.createElement("a");
      link.href = `${chapterLink.href.split("#", 1)[0]}#${heading.id}`;
      link.textContent = heading.text;
      headingItem.append(link);
      list.append(headingItem);
    }

    wrapper.replaceWith(details);
    summary.append(wrapper);
    details.append(summary, list);
    details.open = data.defaultOpen;
  }
});
