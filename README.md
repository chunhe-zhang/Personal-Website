# Chunhe Zhang — Personal Website

A personal portfolio showcasing Chunhe Zhang’s professional experience, projects, and skills, alongside personal insights, ideas, and interests.

Double-click `index.html` to open the website in your browser. It works offline.
No installation, account, server, domain, subscription, or hosting is required.
The source code is available on GitHub. Website hosting has not been enabled.
The page makes no external network requests.

## Edit it

Open these files in a text editor such as Notepad:

- `index.html`: change your name, bio, browser title, and navigation labels.
- `styles.css`: change colors, typography, spacing, and mobile layout. The main colors are at the top.
- `assets/reference.png`: the original reference screenshot. CSS shows only its portrait area; your name, bio, frame, and navigation are actual HTML and CSS.

After saving an edit, refresh your browser to see the change.

## Replace the portrait

1. Put your photo in `assets` and name it `portrait.jpg`.
2. In `index.html`, replace the image inside `<figure class="portrait">` with:

```html
<img class="portrait-photo" src="assets/portrait.jpg" alt="Portrait of Chunhe Zhang">
```

The reference image can then be removed. For best results, use a vertical photo with a similar 500:665 aspect ratio.

## Add links later

The navigation labels are intentionally unlinked and do not pretend to open unfinished pages.
When you have another page, replace its label with an anchor, for example:

```html
<a class="nav-item" href="projects.html">Projects</a>
```

Keep the folder together when moving or copying it. You have the complete source;
there are no frameworks, dependencies, tracking scripts, or service connections.
