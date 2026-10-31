FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["TalkToEveryone.Api/TalkToEveryone.Api.csproj", "TalkToEveryone.Api/"]
RUN dotnet restore "TalkToEveryone.Api/TalkToEveryone.Api.csproj"
COPY . .
WORKDIR "/src/TalkToEveryone.Api"
RUN dotnet publish "TalkToEveryone.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "TalkToEveryone.Api.dll"]
