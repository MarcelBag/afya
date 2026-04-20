from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm, UserCreationForm


User = get_user_model()


class DashboardAuthenticationForm(AuthenticationForm):
    username = forms.CharField(label="Username or email")

    def clean(self):
        username = self.cleaned_data.get("username", "").strip()
        if username and "@" in username:
            matches = User.objects.filter(email__iexact=username, is_active=True).order_by("id")
            if matches.count() == 1:
                self.cleaned_data["username"] = matches.first().get_username()
        return super().clean()


class DashboardUserCreateForm(UserCreationForm):
    email = forms.EmailField(required=True)
    first_name = forms.CharField(required=False)
    last_name = forms.CharField(required=False)
    role = forms.ChoiceField(choices=User.ROLE_CHOICES)
    is_staff = forms.BooleanField(required=False)
    is_active = forms.BooleanField(required=False, initial=True)

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "role", "is_staff", "is_active")


class DashboardUserUpdateForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "role", "is_staff", "is_active")


class DashboardProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ("email", "first_name", "last_name")


class DashboardPasswordChangeForm(PasswordChangeForm):
    pass
