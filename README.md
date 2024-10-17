English | [中文简体](./README_cn.md)

## 1 Introduction

![](./images/img1.png)

ExMemo is a personal knowledge management project designed to centrally record and manage various types of information, including favorite texts, books, music, videos, web pages, work documents, as well as reflections and thoughts about life. By systematically integrating these elements, it aims to break through cognitive limitations and discover internal connections.

![](./images/img2.png)

The system consists of a database, backend, and multiple front-ends. Distributed storage and databases are used to store user files, text, and corresponding vector data. Data storage can be deployed locally to protect user privacy. The backend provides general interfaces for data creation, reading, updating, and deletion (CRUD) operations and is responsible for invoking large models and processing data. The system supports mainstream online large models like OpenAI, Gemini, Qwen as well as offline models like Ollama. Multiple front-ends are available in the form of web services, WeChat bots, Obsidian plugins, and browser extensions for users to upload and download data.

`obsidian-exmemo-client` is a client of ExMemo designed as an Obsidian plugin for synchronization and retrieval.

## 2 Main Features

* Use ExMemo to sync Obsidian notes across different devices and store them on the backend.
* Retrieve user data synced to ExMemo from various terminals.
* Integrate content such as web pages and quick notes from ExMemo into Obsidian notes.

## 3 Instructions

### 3.1 Installing the ExMemo Server

Installation instructions can be found at: https://github.com/exmemo-ai/exmemo

### 3.2 Installing obsidian-exmemo-client

#### 3.2.1 Method 1: Install from Community Plugin Market

Search for the keyword "exmemo" in the community plugin market and install the plugin.

#### 3.2.2 Method 2: Download Source Code for Compilation Installation

(Mainly used when modification of source code is needed)

**Download Compilation**

```bash
cd /exports/exmemo/code
git clone https://github.com/exmemo-ai/obsidian-exmemo-client.git
docker run --name obdev --rm -v /exports:/exports -it node:18 sh
cd /exports/exmemo/code/obsidian-exmemo-client
npm install
npm run build # build to main.js
```

You can also download the latest version of the plugin directly from the Release page on GitHub.

**Installation**

* Copy the compiled `main.js`, `manifest.json`, and `styles.css` to the.obsidian/plugins/obsidian-exmemo-client/ directory of your Obsidian vault.
* Open Obsidian, go to "Settings" -> "Third-party plugins"
* Find "ExMemo" and click the enable button.

### 3.3 Settings

![](./images/img3.png)

- Server address format: http://IP:PORT. Please set up the ExMemo backend service before use.
- You need to register a user on the ExMemo frontend before using it for the first time.
- Modify include/exclude directories or files, as well as set synchronization time as per prompts.

## 4 Usage

Press Ctrl+P to bring up the plugin, enter ExMemo in the search box, and select the desired ob plugin function.

### 4.1 Sync Notes

* Sync current note
* Upload or download all notes to/from ExMemo server

### 4.2 Search Data

* By entering keywords, you can match notes, bookmarked web pages, or impromptu records and insert results into your current note.
* Use spaces to separate multiple keywords if needed.
* Matching priority: Title match > Content match > Fuzzy match.
* You can filter search data by setting start and end times and number of entries.

### 4.3 Note

Before using "Sync All Files" for the first time, please back up your Obsidian data in case of unexpected situations.

## 5 License

This project is licensed under GNU Lesser General Public License v3.0. For details, please refer to [LICENSE](./LICENSE) file.