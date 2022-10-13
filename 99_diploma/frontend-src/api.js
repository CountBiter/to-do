const PREFIX = location.origin;

const req = (url, options = {}) => {
  const { body } = options;

  return fetch((PREFIX + url).replace(/\/\/$/, ""), {
    ...options,
    body: body ? JSON.stringify(body) : null,
    headers: {
      ...options.headers,
      ...(body
        ? {
            "Content-Type": "application/json",
          }
        : null),
    },
  }).then((res) =>
    res.ok
      ? res.json()
      : res.text().then((message) => {
          throw new Error(message);
        })
  );
};

export const getNotes = async ({ age, search, page } = {}) => {
  if (!search) {
    const allNotes = await req(`/getNotes?age=${age}&page=${page} `, { method: "GET" }).then((data) => {
      if (data.length === 10) {
        data.hasMore = true;
        return data;
      } else {
        return data;
      }
    });

    return allNotes;
  }

  const searchNotes = await req(`/getNotes${search}`, { method: "GET" }).then((data) => {
    return data;
  });

  return searchNotes;
};

export const createNote = async (title, text) => {
  const newNote = await req("/dashboard", { method: "POST", body: { title: title, text: text } }).then((data) => {
    return data;
  });

  return newNote;
};

export const getNote = async (id) => {
  const neededNote = await req(`/getNote${id}`, { method: "GET" }).then((data) => {
    return data;
  });
  return neededNote;
};

export const archiveNote = async (id) => {
  const archiveNoteTrue = await req(`/archiveNote${id}`, { method: "GET" }).then((data) => {
    return data;
  });

  return archiveNoteTrue;
};

export const unarchiveNote = async (id) => {
  const unarchiveNoteTrue = await req(`/unarchiveNote${id}`, { method: "GET" }).then((data) => {
    return data;
  });

  return unarchiveNoteTrue;
};

export const editNote = async (id, title, text) => {
  const editNote = await req("/editNote", { method: "PUT", body: { id: id, title: title, text: text } }).then(
    (data) => {
      return data;
    }
  );

  return editNote;
};

export const deleteNote = (id) => {
  req(`/deleteNote${id}`, { method: "GET" });
};

export const deleteAllArchived = async () => {
  req("/deleteAllArchived", { method: "GET" });
};

export const notePdfUrl = async (id) => {
  const note = await req(`/getNote${id}`, { method: "GET" }).then((data) => {
    return data;
  });

  fetch(`/downloadNote${id}`, { method: "GET" })
    .then((res) => res.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;

      a.download = `${note.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    });
};
