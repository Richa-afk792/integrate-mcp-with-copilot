document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const userMenuBtn = document.getElementById("user-menu-btn");
  const adminModal = document.getElementById("admin-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const adminLoginForm = document.getElementById("admin-login-form");
  const adminStatus = document.getElementById("admin-status");
  const adminUsernameInput = document.getElementById("admin-username");

  let adminToken = null;
  let adminUsername = null;
  let messageTimeoutId = null;
  let lastFocusedElement = null;

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove("hidden");

    if (messageTimeoutId !== null) {
      clearTimeout(messageTimeoutId);
    }

    messageTimeoutId = setTimeout(() => {
      messageDiv.classList.add("hidden");
      messageTimeoutId = null;
    }, 5000);
  }

  function updateAdminUI() {
    const isAdmin = Boolean(adminToken);
    const submitButton = signupForm.querySelector("button[type='submit']");

    signupForm.querySelectorAll("input, select").forEach((element) => {
      element.disabled = !isAdmin;
    });
    submitButton.disabled = !isAdmin;

    if (isAdmin) {
      adminStatus.textContent = `Logged in as ${adminUsername}. You can register and unregister students.`;
      adminStatus.className = "message success";
      userMenuBtn.textContent = "✅";
      userMenuBtn.setAttribute("aria-label", "Open teacher menu");
      userMenuBtn.title = "Teacher logged in";
    } else {
      adminStatus.textContent = "Students can view activity rosters. Teachers must log in to register or unregister students.";
      adminStatus.className = "message info";
      userMenuBtn.textContent = "👤";
      userMenuBtn.setAttribute("aria-label", "Open admin login");
      userMenuBtn.title = "Open teacher login";
    }
  }

  function openAdminModal() {
    lastFocusedElement = document.activeElement;
    adminModal.classList.remove("hidden");
    adminUsernameInput.focus();
  }

  function closeAdminModal() {
    adminModal.classList.add("hidden");
    if (lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML =
        '<option value="">-- Select an activity --</option>';

      const isAdmin = Boolean(adminToken);

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        isAdmin
                          ? `<button class="delete-btn" type="button" aria-label="Unregister ${email} from ${name}" data-activity="${name}" data-email="${email}">❌</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: {
            "X-Admin-Token": adminToken,
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!adminToken) {
      showMessage("Teachers must log in before registering students.", "error");
      return;
    }

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: {
            "X-Admin-Token": adminToken,
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  userMenuBtn.addEventListener("click", openAdminModal);

  closeModalBtn.addEventListener("click", closeAdminModal);

  adminModal.addEventListener("click", (event) => {
    if (event.target === adminModal) {
      closeAdminModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (adminModal.classList.contains("hidden")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeAdminModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = adminModal.querySelectorAll(
      "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"
    );
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  });

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("admin-username").value;
    const password = document.getElementById("admin-password").value;

    try {
      const response = await fetch("/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Failed to log in", "error");
        return;
      }

      adminToken = result.token;
      adminUsername = result.username;
      adminLoginForm.reset();
      closeAdminModal();
      updateAdminUI();
      fetchActivities();
      showMessage(`Welcome ${adminUsername}. Admin mode enabled.`, "success");
    } catch (error) {
      showMessage("Failed to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  // Initialize app
  updateAdminUI();
  fetchActivities();
});
